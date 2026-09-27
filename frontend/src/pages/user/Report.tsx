import { useState } from "react";
import { FactorInfluence } from "../../components/FactorInfluence";
import { ErrorBox, MLLabel, PolicyLabel, TierBadge } from "../../components/ui";
import { useUser } from "../../layouts/UserLayout";
import { download } from "../../services/api";
import { date } from "../../utils/format";

export default function Report() {
  const { profile: p, userId } = useUser();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const get = async (kind: "pdf" | "json") => {
    setBusy(kind);
    setErr(null);
    try {
      if (kind === "pdf") await download(`/api/reports/${userId}`, `AltCredit_Transparency_Report_${userId}.pdf`);
      else await download(`/api/users/${userId}/export`, `altcredit_profile_${userId}.json`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Transparency report</h1>
          <p>Your score, every rule and a plan for your next product, in one PDF you can keep or share.</p>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={() => get("pdf")} disabled={busy !== null}>
            {busy === "pdf" ? "Generating PDF…" : "Download PDF"}
          </button>
          <button className="btn" onClick={() => get("json")} disabled={busy !== null}>
            {busy === "json" ? "Preparing…" : "Download JSON"}
          </button>
        </div>
      </div>
      {err && <ErrorBox error={err} />}
      <FactorInfluence policy={p.policy} title="Rules that influenced this decision" />
      <div className="card card-body stack">
        <div className="row between">
          <PolicyLabel />
          <span className="xs muted">as of {date(p.policy.as_of)}</span>
        </div>
        <div className="row">
          <span className="big-num">{p.policy.score}</span>
          <TierBadge tier={p.policy.tier} />
          <span className="small">{p.policy.decision.text}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Rule</th><th>Value</th><th className="r">Points</th><th>Explanation</th></tr>
            </thead>
            <tbody>
              {p.policy.factors.map((f) => (
                <tr key={f.id}>
                  <td><b>{f.id}</b> {f.name}</td>
                  <td className="small">{f.value_display}</td>
                  <td className="r num">{f.points} <span className="xs muted">/ {f.max || f.min}</span></td>
                  <td className="small">{f.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divider" />
        <MLLabel />
        <p className="small">
          {p.ml.available
            ? `${p.ml.agreement?.label ?? ""}. ${p.ml.agreement?.text ?? ""}`
            : "ML validation unavailable."}
        </p>
      </div>
    </div>
  );
}
