"""Read a bank statement document (PDF or image) into transaction rows, and derive profile facts from transactions.

Two ways to get text out of a document:
  * Text PDFs (downloaded e-statements): words and their positions are read directly with PyMuPDF.
  * Scanned PDFs and photos (PNG/JPG): pages are rendered to images and read with OCR (RapidOCR, an
    ONNX model that installs with pip; no system Tesseract needed).

Both produce positioned words, which are grouped into table rows. A row is a transaction when it starts
with a date and carries at least one amount. Debit/credit comes from the statement's own column headers
(Withdrawal/Debit, Deposit/Credit), a Cr/Dr marker, or the change in the running balance, in that order.
Rows are then categorised from their description with a keyword table; anything unrecognised is kept as
"Other" and reported back rather than guessed.

derive_profile() infers only what a statement actually shows (salary or gig income and how many
consecutive months it has run, rent and how long it has been paid). Everything else is left missing and the
rule engine treats it as missing, exactly as it does for any applicant.
"""
from __future__ import annotations

import io
import re
from datetime import datetime

import numpy as np
import pandas as pd

DOCUMENT_EXTENSIONS = (".pdf", ".png", ".jpg", ".jpeg")
MAX_PAGES = 30
MIN_TEXT_WORDS = 15          # fewer words than this on a PDF page -> treat it as scanned and OCR it
OCR_DPI = 200

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
DATE_RES = [
    (re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})$"), "ymd"),
    (re.compile(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$"), "dmy"),          # Indian statements are day-first
    (re.compile(r"^(\d{1,2})[ -]?([A-Za-z]{3})[a-z]*[ -,]*(\d{2,4})$"), "dMy"),
]
AMOUNT_RE = re.compile(r"^(?:₹|Rs\.?|INR)?\s*(-?[\d,]*\d(?:\.\d{1,2})?)\s*(Cr|Dr|CR|DR|cr|dr)?\.?$")
DR_CR_RE = re.compile(r"^(Cr|Dr|CR|DR|cr|dr)\.?$")

DEBIT_HEADERS = ("withdrawal", "withdrawals", "debit", "debits", "dr", "paid out", "debit amount")
CREDIT_HEADERS = ("deposit", "deposits", "credit", "credits", "cr", "paid in", "credit amount")
BALANCE_HEADERS = ("balance", "closing balance", "bal")

# (category, subtype, keywords) checked in order; the first match wins.
CATEGORY_RULES = [
    ("Salary", None, ("salary", "sal cr", "payroll", "wages")),
    ("Stipend", None, ("stipend", "scholarship")),
    ("Gig Payout", None, ("payout", "driver earnings", "partner earnings", "settlement uber", "settlement ola")),
    ("Business Income", None, ("business", "invoice", "client payment")),
    ("Loan EMI", None, ("emi", "loan", "nach")),
    ("Rent", None, ("rent", "landlord")),
    ("Utility Bill", None, ("electricity", "bescom", "tneb", "mseb", "power", "water", "gas bill", "piped gas", "utility")),
    ("Telecom", None, ("airtel", "jio", "vodafone", "vi prepaid", "bsnl", "recharge", "broadband", "mobile bill", "postpaid", "telecom")),
    ("Savings", "recurring_investment", ("sip", "mutual fund", "recurring deposit", "ppf", "nps")),
    ("Savings", "micro_savings", ("savings", "save", "piggy", "fd ", "fixed deposit", "digital gold")),
    ("Food", None, ("grocery", "groceries", "bigbasket", "blinkit", "zepto", "dmart", "supermarket", "kirana", "vegetable", "milk", "food")),
    ("Dining", None, ("swiggy", "zomato", "restaurant", "cafe", "dominos", "pizza", "dining", "eatery")),
    ("Shopping", None, ("amazon", "flipkart", "myntra", "ajio", "meesho", "mall", "store", "shopping")),
    ("Transport", None, ("uber", "ola", "rapido", "metro", "fuel", "petrol", "diesel", "irctc", "bus", "transport", "fastag")),
    ("Healthcare", None, ("pharmacy", "hospital", "apollo", "medplus", "clinic", "medical", "health")),
    ("Education", None, ("school", "college", "tuition", "course", "udemy", "education", "exam fee")),
    ("Cash Withdrawal", None, ("atm", "cash wdl", "cash withdrawal", "cwdr")),
    ("Charity", None, ("donation", "charity", "temple", "ngo")),
]
CREDIT_ONLY = {"Salary", "Stipend", "Gig Payout", "Business Income"}


class DocumentError(ValueError):
    pass


# ---------------------------------------------------------------------------
# text extraction
# ---------------------------------------------------------------------------
_ocr_engine = None


def _ocr():
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
        except ImportError as e:     # pragma: no cover - depends on the install
            raise DocumentError("OCR is not installed on the server (pip install rapidocr-onnxruntime)") from e
        _ocr_engine = RapidOCR()
    return _ocr_engine


def _ocr_words(png: bytes) -> list[tuple[float, float, float, str]]:
    """OCR one page image -> (x0, x1, y_center, text) per detected text box."""
    result, _ = _ocr()(png)
    words = []
    for box, text, _conf in result or []:
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        words.append((min(xs), max(xs), (min(ys) + max(ys)) / 2, text.strip()))
    return words


def document_words(content: bytes, filename: str) -> tuple[list[list[tuple]], dict]:
    """Return positioned words per page, and how each page was read."""
    name = filename.lower()
    report = {"pages": 0, "text_pages": 0, "ocr_pages": 0}
    pages: list[list[tuple]] = []
    if name.endswith((".png", ".jpg", ".jpeg")):
        pages.append(_ocr_words(content))
        report.update(pages=1, ocr_pages=1)
        return pages, report
    try:
        import pymupdf
    except ImportError as e:     # pragma: no cover
        raise DocumentError("PDF reading is not installed on the server (pip install pymupdf)") from e
    try:
        doc = pymupdf.open(stream=content, filetype="pdf")
    except Exception as e:
        raise DocumentError(f"not a readable PDF: {e}") from e
    if doc.needs_pass:
        raise DocumentError("the PDF is password-protected; upload an unlocked copy")
    for page in list(doc)[:MAX_PAGES]:
        report["pages"] += 1
        words = [(w[0], w[2], (w[1] + w[3]) / 2, w[4]) for w in page.get_text("words")]
        if len(words) >= MIN_TEXT_WORDS:
            report["text_pages"] += 1
            pages.append(words)
        else:
            png = page.get_pixmap(dpi=OCR_DPI).tobytes("png")
            report["ocr_pages"] += 1
            # OCR coordinates are in pixels; scale back to PDF points so both paths group rows the same way
            scale = 72 / OCR_DPI
            pages.append([(a * scale, b * scale, y * scale, t) for a, b, y, t in _ocr_words(png)])
    if not report["pages"]:
        raise DocumentError("the PDF has no pages")
    return pages, report


# ---------------------------------------------------------------------------
# rows -> transactions
# ---------------------------------------------------------------------------
def _rows(words: list[tuple], tol: float = 4.0) -> list[list[tuple]]:
    """Group words whose vertical centres are within `tol` points into one row, left to right."""
    rows: list[list[tuple]] = []
    for w in sorted(words, key=lambda w: (w[2], w[0])):
        if rows and abs(rows[-1][0][2] - w[2]) <= tol:
            rows[-1].append(w)
        else:
            rows.append([w])
    return [sorted(r, key=lambda w: w[0]) for r in rows]


def parse_date(text: str) -> str | None:
    s = text.strip().rstrip(",")
    for rx, kind in DATE_RES:
        m = rx.match(s)
        if not m:
            continue
        try:
            if kind == "ymd":
                y, mo, d = int(m[1]), int(m[2]), int(m[3])
            elif kind == "dmy":
                d, mo, y = int(m[1]), int(m[2]), int(m[3])
            else:
                d, mo, y = int(m[1]), MONTHS.get(m[2][:3].lower(), 0), int(m[3])
            if y < 100:
                y += 2000
            return datetime(y, mo, d).strftime("%Y-%m-%d")
        except ValueError:
            return None
    return None


def _amount(text: str) -> tuple[float, str | None] | None:
    m = AMOUNT_RE.match(text.replace(" ", ""))
    if not m or not re.search(r"\d", m[1]):
        return None
    try:
        return float(m[1].replace(",", "")), (m[2] or "").upper() or None
    except ValueError:
        return None


def _leading_date(row: list[tuple]) -> tuple[str | None, int]:
    """A date may be one word ('01/06/2025') or split over up to three ('01 Jun 2025')."""
    for n in (1, 3, 2):
        if len(row) >= n:
            d = parse_date(" ".join(w[3] for w in row[:n]))
            if d:
                return d, n
    return None, 0


def _header_columns(row: list[tuple]) -> dict | None:
    """Find Debit / Credit / Balance column centres from a header row."""
    cols = {}
    for x0, x1, _y, t in row:
        k = t.strip().lower().rstrip(".:")
        centre = (x0 + x1) / 2
        if k in DEBIT_HEADERS or k.startswith("withdraw"):
            cols["debit"] = centre
        elif k in CREDIT_HEADERS or k.startswith("deposit"):
            cols["credit"] = centre
        elif k in BALANCE_HEADERS or k.startswith("balance"):
            cols["balance"] = centre
    return cols if ("debit" in cols and "credit" in cols) else None


def categorise(description: str, is_credit: bool) -> tuple[str, str | None]:
    d = f" {description.lower()} "
    for cat, sub, keys in CATEGORY_RULES:
        if cat in CREDIT_ONLY and not is_credit:
            continue
        if any(k in d for k in keys):
            return cat, sub
    return ("Other Income" if is_credit else "Other"), None


def words_to_transactions(pages: list[list[tuple]]) -> tuple[pd.DataFrame, dict]:
    out, skipped, cols = [], 0, None
    prev_balance = None
    for words in pages:
        for row in _rows(words):
            hdr = _header_columns(row)
            if hdr:
                cols = hdr
                continue
            date, n = _leading_date(row)
            if not date:
                continue
            rest = row[n:]
            amounts = []
            desc_words = []
            marker = None
            for w in rest:
                if DR_CR_RE.match(w[3]) and amounts:
                    marker = w[3].upper().rstrip(".")
                    continue
                a = _amount(w[3])
                if a is not None and ("," in w[3] or "." in w[3] or len(w[3].replace("-", "")) >= 3 or amounts):
                    amounts.append((w, a))
                elif not amounts:
                    desc_words.append(w[3])
            # a value-date column right after the description is not an amount
            amounts = [(w, a) for w, a in amounts if not parse_date(w[3])]
            if cols:     # with known columns, numbers far from every amount column belong to the description
                amounts = [(w, a) for w, a in amounts if min(abs(c - (w[0] + w[1]) / 2) for c in cols.values()) <= 60]
            if not amounts:
                skipped += 1
                continue
            description = " ".join(desc_words).strip() or "Transaction"
            balance = None
            direction = None
            value = None
            if cols:
                for w, (v, mk) in amounts:
                    centre = (w[0] + w[1]) / 2
                    nearest = min(cols, key=lambda k: abs(cols[k] - centre))
                    if nearest == "balance":
                        balance = v
                    elif nearest in ("debit", "credit") and v != 0:
                        value, direction = abs(v), ("DEBIT" if nearest == "debit" else "CREDIT")
            if value is None:
                (w0, (v0, mk0)) = amounts[0]
                value = abs(v0)
                if len(amounts) >= 2:
                    balance = amounts[-1][1][0]
                mk = marker or mk0
                if mk in ("CR", "DR"):
                    direction = "CREDIT" if mk == "CR" else "DEBIT"
                elif v0 < 0:
                    direction = "DEBIT"
            if direction is None and balance is not None and prev_balance is not None:
                delta = balance - prev_balance
                if abs(abs(delta) - value) <= 1:
                    direction = "CREDIT" if delta > 0 else "DEBIT"
            if direction is None:
                cat_guess, _ = categorise(description, True)
                direction = "CREDIT" if cat_guess in CREDIT_ONLY else "DEBIT"
            if balance is not None:
                prev_balance = balance
            cat, sub = categorise(description, direction == "CREDIT")
            status = "Late" if re.search(r"\blate\b|penalty|bounce|return", description, re.I) else "Completed"
            out.append({"date": date, "amount": round(value, 2), "category": cat, "type": direction, "status": status,
                        "subtype": sub, "balance_after": balance, "description": description[:120]})
    df = pd.DataFrame(out)
    info = {"rows_read": len(df), "rows_skipped": skipped,
            "uncategorised": int((df["category"].isin(["Other", "Other Income"])).sum()) if len(df) else 0,
            "columns_detected": bool(cols)}
    return df, info


def parse_statement_document(content: bytes, filename: str) -> tuple[pd.DataFrame, dict]:
    pages, report = document_words(content, filename)
    df, info = words_to_transactions(pages)
    report |= info
    if df.empty:
        how = "OCR" if report["ocr_pages"] else "the PDF text"
        raise DocumentError(f"no transactions found in the document (read {report['pages']} page(s) with {how}); "
                            "each transaction line needs a date and an amount")
    report["date_range"] = [df["date"].min(), df["date"].max()]
    sample = df.head(5).astype(object).where(df.head(5).notna(), None).to_dict("records")
    return df.drop(columns=["description"]), report | {"sample": sample}


# ---------------------------------------------------------------------------
# profile facts a statement can support
# ---------------------------------------------------------------------------
def _run_ending_last(months: set, last) -> int:
    """Consecutive months present, counting back from the statement's last month."""
    n, m = 0, last
    while m in months:
        n += 1
        m = m - 1
    return n


def derive_profile(txn: pd.DataFrame) -> dict:
    """Infer employment and housing from transactions. Returns profile fields plus a note per field."""
    t = txn.copy()
    t["month"] = pd.to_datetime(t["date"], errors="coerce").dt.to_period("M")
    t = t[t["month"].notna()]
    if t.empty:
        return {"fields": {}, "notes": {}}
    last = t["month"].max()
    credit = t["type"].astype(str).str.upper() == "CREDIT"
    fields, notes = {}, {}
    income_types = [("Salary", "salaried"), ("Gig Payout", "gig"), ("Business Income", "self_employed"), ("Stipend", "student")]
    best = None
    for cat, status in income_types:
        months = set(t.loc[credit & (t["category"] == cat), "month"])
        if len(months) >= 2 and (best is None or len(months) > best[2]):
            best = (cat, status, len(months), _run_ending_last(months, last))
    if best:
        cat, status, n_months, run = best
        fields["employment_status"] = status
        if status != "student":
            fields["months_in_current_job"] = run
        notes["employment"] = (f"{status.replace('_', ' ')}: {cat} credits in {n_months} month(s); the current run is {run} "
                               "consecutive month(s), a lower bound because the statement only covers that period")
    else:
        notes["employment"] = "not inferred: no regular income credits found; employment stability scores as missing"
    rent = t[~credit & (t["category"] == "Rent")]
    rent_months = set(rent["month"])
    if len(rent_months) >= 2:
        fields["housing_status"] = "rent"
        fields["monthly_rent"] = round(float(rent.groupby("month")["amount"].sum().median()), 2)
        fields["months_at_address"] = _run_ending_last(rent_months, last)
        notes["housing"] = (f"renting: rent paid in {len(rent_months)} month(s), about Rs {fields['monthly_rent']:,.0f} a month; "
                            "time at the address is counted from the first rent payment in the statement")
    else:
        notes["housing"] = "not inferred: no regular rent payments found; housing scores as missing"
    notes["income"] = "measured from income credits in the statement by the rule engine (not declared)"
    notes["not_collected"] = "age, education and city tier are not asked; education scores as missing"
    return {"fields": fields, "notes": notes}
