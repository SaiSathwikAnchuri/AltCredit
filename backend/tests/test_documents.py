"""Bank statement documents: PDF text and OCR both recover the same transactions, and profile facts are inferred honestly."""
from __future__ import annotations

import importlib.util
import io
from pathlib import Path

import pandas as pd
import pytest
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.ingestion.documents import categorise, derive_profile, parse_date, parse_statement_document

SAMPLE = Path(__file__).resolve().parents[2] / "frontend" / "public" / "sample_transactions.csv"
NARRATION = {"Salary": "NEFT CR ACME TECH SALARY", "Rent": "UPI RENT TO LANDLORD", "Utility Bill": "BESCOM ELECTRICITY BILL",
             "Telecom": "AIRTEL POSTPAID", "Food": "BIGBASKET GROCERY", "Dining": "SWIGGY ORDER", "Shopping": "AMAZON PAY",
             "Transport": "UBER TRIP", "Savings": "AUTO SAVE DIGITAL GOLD"}
needs_ocr = pytest.mark.skipif(importlib.util.find_spec("rapidocr_onnxruntime") is None, reason="OCR engine not installed")


def statement_pdf(layout: str, rows: pd.DataFrame) -> bytes:
    """A synthetic bank statement: 'cols' has Withdrawal/Deposit columns, 'crdr' one amount column with Cr/Dr markers."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _, h = A4
    y = h - 60

    def head():
        nonlocal y
        c.setFont("Helvetica-Bold", 9)
        cols = [(40, "Date"), (110, "Narration"), (330, "Withdrawal"), (410, "Deposit"), (490, "Balance")] if layout == "cols" else \
               [(40, "Txn Date"), (120, "Particulars"), (380, "Amount"), (480, "Balance")]
        for x, t in cols:
            c.drawString(x, y, t)
        y -= 16
        c.setFont("Helvetica", 9)

    c.setFont("Helvetica-Bold", 13)
    c.drawString(40, y, "Mock Bank - Account Statement")
    y -= 30
    head()
    for r in rows.itertuples():
        if y < 50:
            c.showPage()
            y = h - 50
            head()
        d = pd.Timestamp(r.date)
        amt, bal = f"{r.amount:,.2f}", f"{r.balance_after:,.2f}"
        if layout == "cols":
            c.drawString(40, y, d.strftime("%d/%m/%Y"))
            c.drawString(110, y, NARRATION[r.category])
            c.drawRightString(390 if r.type == "DEBIT" else 470, y, amt)
        else:
            c.drawString(40, y, d.strftime("%d %b %Y"))
            c.drawString(120, y, NARRATION[r.category])
            c.drawRightString(450, y, amt + (" Cr" if r.type == "CREDIT" else " Dr"))
        c.drawRightString(560, y, bal)
        y -= 14
    c.save()
    return buf.getvalue()


def _key(df):
    return set(zip(df["date"], df["amount"].round(2), df["type"], df["category"]))


@pytest.fixture(scope="module")
def truth():
    return pd.read_csv(SAMPLE)


@pytest.mark.parametrize("layout", ["cols", "crdr"])
def test_text_pdf_recovers_every_transaction(truth, layout):
    df, rep = parse_statement_document(statement_pdf(layout, truth), "statement.pdf")
    assert rep["text_pages"] == rep["pages"] and rep["ocr_pages"] == 0
    assert _key(df) == _key(truth)
    assert rep["uncategorised"] == 0


@needs_ocr
def test_scanned_page_is_read_with_ocr(truth):
    import pymupdf
    rows = truth.head(30)
    page = pymupdf.open(stream=statement_pdf("cols", rows), filetype="pdf")[0]
    png = page.get_pixmap(dpi=150).tobytes("png")
    df, rep = parse_statement_document(png, "photo.png")
    assert rep["ocr_pages"] == 1
    assert _key(df) == _key(rows)


def test_profile_inferred_only_from_what_the_statement_shows(truth):
    d = derive_profile(truth)
    assert d["fields"]["employment_status"] == "salaried" and d["fields"]["months_in_current_job"] == 12
    assert d["fields"]["housing_status"] == "rent" and d["fields"]["monthly_rent"] == 9000
    assert not {"age", "education_level", "city_tier", "monthly_income"} & set(d["fields"])
    no_rent = derive_profile(truth[truth["category"] != "Rent"])
    assert "housing_status" not in no_rent["fields"] and "not inferred" in no_rent["notes"]["housing"]


def test_parsing_helpers():
    assert parse_date("05/06/2025") == "2025-06-05"          # day first
    assert parse_date("5 Jun 2025") == "2025-06-05"
    assert parse_date("2025-06-05") == "2025-06-05"
    assert parse_date("31/02/2025") is None
    assert categorise("NEFT SALARY JUNE", True) == ("Salary", None)
    assert categorise("SALARY REVERSAL", False)[0] != "Salary"   # income categories only on credits
    assert categorise("SOMETHING UNKNOWN", False) == ("Other", None)


def test_unreadable_documents_are_rejected():
    with pytest.raises(ValueError):
        parse_statement_document(b"not a pdf", "x.pdf")
    blank = io.BytesIO()
    c = canvas.Canvas(blank)
    c.drawString(40, 700, "Nothing that looks like a transaction here, just a letter with enough words to count as text on the page.")
    c.save()
    with pytest.raises(ValueError, match="no transactions"):
        parse_statement_document(blank.getvalue(), "letter.pdf")
