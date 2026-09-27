import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { DataQualityPanel } from "../../components/DataQualityPanel";
import { FactorBreakdown } from "../../components/FactorBreakdown";
import { FactorInfluence } from "../../components/FactorInfluence";
import { MLValidationPanel } from "../../components/MLValidationPanel";
import { TierBadge } from "../../components/ui";
import { useUser } from "../../layouts/UserLayout";

export default function ScoreDetails() {
  const { profile: p } = useUser();
  const pol = p.policy;
  const loc = useLocation();
  const [tab, setTab] = useState<"factors" | "ml" | "quality">(loc.hash === "#ml" ? "ml" : "factors");
  useEffect(() => {
    if (loc.hash === "#ml") setTab("ml");
  }, [loc.hash]);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>
            Your score: <span className="num">{pol.score}</span> <span className="muted" style={{ fontWeight: 500, fontSize: 18 }}>/ 1000</span>
          </h1>
          <p>Built from 14 published rules. Here is how each one scored you.</p>
        </div>
        <TierBadge tier={pol.tier} />
      </div>

      <div className="tabs" role="tablist">
        {([
          ["factors", "Rule breakdown"],
          ["ml", "ML check"],
          ["quality", "Data quality"],
        ] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "factors" && (
        <div className="grid g-main">
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Every rule</h2>
                <p>Grouped by component, with points earned out of the maximum.</p>
              </div>
            </div>
            <div className="card-body">
              <FactorBreakdown policy={pol} showEvidence={false} />
              <details style={{ marginTop: 14 }}>
                <summary className="small" style={{ cursor: "pointer", color: "var(--brand)", fontWeight: 600 }}>Show the exact calculation</summary>
                <ol className="mono" style={{ margin: "10px 0 0", paddingLeft: 22, lineHeight: 1.9 }}>
                  {pol.trace.map((l, i) => <li key={i}>{l}</li>)}
                </ol>
              </details>
            </div>
          </div>
          <div className="stack">
            <FactorInfluence policy={pol} title="Which rules matter most" />
            {p.explanation.score_decreased_because.length > 0 && (
              <div className="card card-pad stack" style={{ gap: 8 }}>
                <h3>Why it isn't higher</h3>
                <ul className="list small">
                  {p.explanation.score_decreased_because.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "ml" && (
        <div id="ml" className="stack">
          <MLValidationPanel ml={p.ml} policy={pol} />
          <div className="callout small">
            Your <b>policy score</b> decides eligibility. The ML check is a separate model trained on past repayments; if it disagrees, a lender may look
            more closely, but it can never raise or lower your score.
          </div>
        </div>
      )}

      {tab === "quality" && <DataQualityPanel dq={pol.data_quality} weakId={pol.weak_id} blocked={pol.identity_blocked} />}
    </div>
  );
}
