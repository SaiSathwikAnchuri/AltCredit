import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import FileDrop from "../components/FileDrop";
import { ErrorBox } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { api, type Session } from "../services/api";
import { Brand } from "../layouts/UserLayout";

interface RegisterOut {
  session: Session;
  ingestion: { stats: Record<string, unknown>; issues: { check_code: string; severity: string; message: string; count: number }[] };
  document: { pages: number; text_pages: number; ocr_pages: number; rows_read: number; uncategorised: number; date_range: [string, string] } | null;
  derived_profile: { fields: Record<string, string | number>; notes: Record<string, string> };
  score: number;
  tier: { name: string };
}

const DERIVED_LABEL: Record<string, string> = { employment: "Employment", housing: "Housing", income: "Income", not_collected: "Not asked" };

export default function Register() {
  const { adopt } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ username: "", password: "", display_name: "" });
  const [txn, setTxn] = useState<File | null>(null);
  const [bills, setBills] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterOut | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!txn) {
      setErr("Upload your bank statement (PDF, photo, CSV or JSON).");
      return;
    }
    setBusy(true);
    setErr(null);
    const form = new FormData();
    form.append("username", f.username);
    form.append("password", f.password);
    form.append("profile", JSON.stringify({ display_name: f.display_name || f.username }));
    form.append("transactions", txn);
    if (bills) form.append("bills", bills);
    try {
      const r = await api<RegisterOut>("/api/auth/register", { form, method: "POST" });
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div>
          <Link to="/login" style={{ textDecoration: "none" }}>
            <Brand />
          </Link>
          <h1 style={{ marginTop: 16 }}>Create your AltCredit profile</h1>
          <p>Upload 6–12 months of your bank statement. We read it (with OCR for scans and photos), and the rule engine scores you immediately.</p>
        </div>
      </div>
      {result ? (
        <div className="card card-pad stack">
          <h2>Your profile is scored</h2>
          <p>
            Policy score <b className="num">{result.score}</b> / 1000 ({result.tier.name}). {String(result.ingestion.stats.transactions)} transactions and{" "}
            {String(result.ingestion.stats.obligations)} bills were read; score as of {String(result.ingestion.stats.as_of)}.
          </p>
          {result.document && (
            <p className="small muted">
              Read {result.document.pages} page{result.document.pages === 1 ? "" : "s"}
              {result.document.ocr_pages > 0 ? ` (${result.document.ocr_pages} with OCR)` : " as text"}: {result.document.rows_read} transactions
              from {result.document.date_range[0]} to {result.document.date_range[1]}
              {result.document.uncategorised > 0 && `; ${result.document.uncategorised} could not be categorised and are counted as "Other"`}.
            </p>
          )}
          <div className="callout small">
            <b>What we took from your statement</b>
            <ul className="list">
              {Object.entries(result.derived_profile.notes).map(([k, v]) => (
                <li key={k}><b>{DERIVED_LABEL[k] ?? k}:</b> {v}</li>
              ))}
            </ul>
          </div>
          {result.ingestion.issues.length > 0 && (
            <div className="callout warn small">
              <b>Validation notes</b>
              <ul className="list">
                {result.ingestion.issues.slice(0, 8).map((i, k) => (
                  <li key={k}>
                    <span className="mono">{i.check_code}</span> ({i.severity}, {i.count}): {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <button className="btn btn-primary" onClick={() => { adopt(result.session); nav("/app"); }}>
              Go to my dashboard
            </button>
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="card card-pad stack">
            <h2>Account</h2>
            <div className="grid g3">
              <label className="field">Username<input value={f.username} onChange={set("username")} minLength={3} maxLength={40} required /></label>
              <label className="field">Password (8+ characters)<input type="password" value={f.password} onChange={set("password")} minLength={8} required /></label>
              <label className="field">Display name<input value={f.display_name} onChange={set("display_name")} placeholder="Shown to you; masked for lenders" /></label>
            </div>
          </div>
          <div className="card card-pad stack">
            <h2>Bank statement</h2>
            <p className="small muted">
              Upload the statement your bank gives you: a <b>PDF</b> (downloaded or scanned) or a <b>photo</b> (PNG/JPG). Text PDFs are read directly;
              scans and photos are read with OCR. Each transaction line needs a date and an amount. Salary, rent, bills, spending and savings are
              recognised from the descriptions, and your employment and housing are inferred from them. CSV or JSON with columns{" "}
              <span className="mono">date, amount, category, type</span> also works.{" "}
              Synthetic samples: <a href="/sample_statement.pdf" download>statement PDF</a>, <a href="/sample_statement_scanned.pdf" download>scanned PDF</a>, <a href="/sample_transactions.csv" download>CSV</a>.
            </p>
            <div className="grid g2">
              <FileDrop label="Bank statement" hint="PDF, PNG, JPG, CSV or JSON · up to 25 MB" accept={[".pdf", ".png", ".jpg", ".jpeg", ".csv", ".json"]} file={txn} onChange={setTxn} />
              <FileDrop label="Bills with due dates" hint="CSV or JSON" accept={[".csv", ".json"]} file={bills} onChange={setBills} optional />
            </div>
          </div>
          {err && <ErrorBox error={err} />}
          <div className="row">
            <button className="btn btn-primary" disabled={busy}>{busy ? "Reading your statement and scoring…" : "Create profile and score me"}</button>
            <Link to="/login">Cancel</Link>
          </div>
        </form>
      )}
    </div>
  );
}
