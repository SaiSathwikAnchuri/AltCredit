import { useState } from "react";
import { Link } from "react-router-dom";
import { ScoreTrendChart } from "../../components/Charts";
import { FactorInfluence } from "../../components/FactorInfluence";
import { ScoreGauge } from "../../components/ScoreGauge";
import { Badge, useToast } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import { useUser } from "../../layouts/UserLayout";
import { api } from "../../services/api";
import type { Profile } from "../../types";
import { AGREEMENT_TONE, date } from "../../utils/format";

interface HistoryRow { score_id: number; as_of: string; score: number; computed_at: string }

export default function Dashboard() {
  const { profile: p, userId, setProfile } = useUser();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const hist = useApi<HistoryRow[]>(`/api/users/${userId}/history`);
  const pol = p.policy;
  const eligible = p.products.filter((x) => x.eligible);
  const trend = [...(hist.data ?? [])]
    .sort((a, b) => a.computed_at.localeCompare(b.computed_at))
    .map((h) => ({ label: date(h.computed_at), score: h.score }));

  const refresh = async () => {
    setBusy(true);
    try {
      const np = await api<Profile>(`/api/users/${userId}/score`, { method: "POST" });
      setProfile(np);
      void hist.reload();
      toast(`Score updated: ${np.policy.score}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const decisionTone = pol.decision.code === "ACCEPT" ? "pos" : pol.decision.code === "REJECT" ? "neg" : "warn";

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="greeting">Hi {p.contact?.display_name?.split(" ")[0] ?? "there"}</div>
          <p>Here's where your credit stands today.</p>
        </div>
        <button className="btn" onClick={refresh} disabled={busy}>
          {busy ? "Updating…" : "Refresh score"}
        </button>
      </div>

      <div className="card hero">
        <div className="hero-score">
          <span className="policy-label">◆ Your AltCredit score</span>
          <ScoreGauge score={pol.score} tier={pol.tier} light caption="" />
          <span className="badge" style={{ background: "#fff", color: pol.tier.color, borderColor: "transparent" }}>
            {pol.tier.code} · {pol.tier.name}
          </span>
        </div>
        <div className="hero-detail">
          <div className="row">
            <Badge tone={decisionTone} dot>{pol.decision.label}</Badge>
            {pol.data_quality.status !== "GOOD" && <Badge tone="warn">Some data missing</Badge>}
            {p.ml.available && p.ml.agreement && (
              <Badge tone={AGREEMENT_TONE[p.ml.agreement.status]} title="Independent ML check. It never changes your score.">ML check: {p.ml.agreement.label}</Badge>
            )}
          </div>
          <p style={{ fontSize: 15 }}>{p.explanation.summary}</p>
          <div className="grid g2" style={{ gap: 12 }}>
            <div className="callout pos small">
              <b>Helping most</b>
              <div>{p.explanation.top_positive.slice(0, 2).map((x) => x.name).join(", ") || "—"}</div>
            </div>
            <div className="callout neg small">
              <b>Holding you back</b>
              <div>{p.explanation.main_reasons.slice(0, 2).map((x) => x.name).join(", ") || "Nothing major"}</div>
            </div>
          </div>
          <div className="row">
            <Link className="btn btn-primary" to="/app/score">See the full breakdown</Link>
            <Link className="btn" to="/app/what-if">Try What-If</Link>
          </div>
        </div>
      </div>

      <div className="quick-grid">
        <div className="card card-pad quick">
          <span className="ico">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <div className="stack" style={{ gap: 4 }}>
            <div className="eyebrow">You qualify for</div>
            <div style={{ fontSize: 22, fontWeight: 750 }}>{eligible.length} <span className="small muted">of {p.products.length} products</span></div>
            <Link className="small" to="/app/products">Browse products →</Link>
          </div>
        </div>
        <div className="card card-pad quick">
          <span className="ico amber">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
          </span>
          <div className="stack" style={{ gap: 4 }}>
            <div className="eyebrow">Next to unlock</div>
            {p.next_locked_product ? (
              <>
                <div style={{ fontWeight: 700 }}>{p.next_locked_product.product_name}</div>
                <div className="small muted">{p.next_locked_product.gap} points to go</div>
                <Link className="small" to={`/app/target?product=${p.next_locked_product.product_id}`}>Plan my way there →</Link>
              </>
            ) : (
              <div className="small">You qualify for everything in the catalog.</div>
            )}
          </div>
        </div>
        <div className="card card-pad quick">
          <span className="ico violet">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4zM4 9h16M9 20V9" /></svg>
          </span>
          <div className="stack" style={{ gap: 4 }}>
            <div className="eyebrow">Your report</div>
            <div style={{ fontWeight: 700 }}>Download a PDF</div>
            <Link className="small" to="/app/report">Get my report →</Link>
          </div>
        </div>
      </div>

      <div className="grid g-main" style={{ alignItems: "start" }}>
        <FactorInfluence policy={pol} limit={5} title="What's shaping your score" sub="Your top rules, ranked by impact." />
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Score over time</h2>
              <p>Each time your score was calculated</p>
            </div>
          </div>
          <div className="card-body">
            <ScoreTrendChart points={trend} />
          </div>
        </div>
      </div>
    </div>
  );
}
