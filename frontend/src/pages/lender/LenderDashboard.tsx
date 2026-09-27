import { Link } from "react-router-dom";
import { DonutChart } from "../../components/Charts";
import { ErrorBox, Loading, Stat } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import type { PolicySnapshot } from "../../types";
import { pct } from "../../utils/format";

interface Dash {
  candidates: number;
  eligible_for_your_products: number;
  above_default_filter: number;
  pending_offers: number;
  applications_received: number;
  applications_by_status: Record<string, number>;
  offers_by_status: Record<string, number>;
  acceptance_rate: number | null;
  enhanced_review: number;
  second_look: number;
  tier_counts: Record<string, number>;
  your_products: { product_id: string; product_name: string; min_score: number }[];
}

const STATUS_COLOR: Record<string, string> = {
  sent: "#93c5fd", viewed: "#1d4ed8", accepted: "#16a34a", rejected: "#c2410c", expired: "#94a3b8", withdrawn: "#d97706",
};

export default function LenderDashboard() {
  const { data: d, error, loading, reload } = useApi<Dash>("/api/lenders/dashboard");
  const policy = useApi<PolicySnapshot>("/api/policy");
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !d) return <Loading />;
  const tiers = policy.data?.tiers ?? [];
  const [lo, hi] = policy.data?.lender_default_score_range ?? [650, 1000];
  const offerItems = Object.entries(d.offers_by_status).map(([k, v]) => ({ label: k, value: v, color: STATUS_COLOR[k] ?? "#64748b" }));
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>Your pipeline across the scored applicant pool.</p>
        </div>
        <Link className="btn btn-primary" to="/lender/candidates">Find candidates</Link>
      </div>
      <div className="grid g4">
        <Stat label="Scored applicants" value={d.candidates.toLocaleString("en-IN")} />
        <Stat label={`In range ${lo}–${hi}`} value={d.above_default_filter.toLocaleString("en-IN")} />
        <Stat label="Eligible for your products" value={d.eligible_for_your_products.toLocaleString("en-IN")} />
        <Stat label="Offer acceptance" value={d.acceptance_rate === null ? "—" : pct(d.acceptance_rate, 0)} sub={`${d.pending_offers} awaiting reply`} />
      </div>

      <div className="grid g-main">
        <div className="card">
          <div className="card-head"><div><h2>Applicant pool by risk tier</h2><p>Policy score tiers</p></div></div>
          <div className="card-body">
            <DonutChart items={tiers.map((t) => ({ label: `${t.code} ${t.name}`, value: d.tier_counts[t.code] ?? 0, color: t.color }))} />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><h2>Your offers</h2><p>By status</p></div><Link className="small" to="/lender/offers">Open →</Link></div>
          <div className="card-body">
            {offerItems.length ? (
              <DonutChart items={offerItems} height={180} />
            ) : (
              <div className="small muted">No offers sent yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid g3">
        <div className="card card-pad stack" style={{ gap: 6 }}>
          <div className="eyebrow">Applications received</div>
          <div style={{ fontSize: 26, fontWeight: 700 }} className="num">{d.applications_received}</div>
          <div className="small muted">
            {Object.entries(d.applications_by_status).map(([s, n]) => `${n} ${s.replace("_", " ").toLowerCase()}`).join(" · ") || "None yet"}
          </div>
          <Link className="small" to="/lender/applications">Review applications →</Link>
        </div>
        <div className="card card-pad stack" style={{ gap: 6, borderTop: "3px solid var(--warn)" }}>
          <div className="eyebrow">Enhanced review</div>
          <div style={{ fontSize: 26, fontWeight: 700 }} className="num">{d.enhanced_review}</div>
          <div className="small muted">Rule-eligible, but ML sees elevated risk</div>
          <Link className="small" to="/lender/candidates?review_flag=ENHANCED_REVIEW">Review them →</Link>
        </div>
        <div className="card card-pad stack" style={{ gap: 6, borderTop: "3px solid var(--ml)" }}>
          <div className="eyebrow">Second look</div>
          <div style={{ fontSize: 26, fontWeight: 700 }} className="num">{d.second_look}</div>
          <div className="small muted">Below cut-off, but ML sees lower risk</div>
          <Link className="small" to="/lender/candidates?review_flag=SECOND_LOOK&score_min=0">See them →</Link>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Your products</h2></div>
        {d.your_products.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Product</th><th className="r">Min score</th><th /></tr></thead>
              <tbody>
                {d.your_products.map((p) => (
                  <tr key={p.product_id}>
                    <td><b>{p.product_name}</b></td>
                    <td className="r num">{p.min_score}</td>
                    <td className="r">
                      <Link className="btn btn-sm" to={`/lender/candidates?eligible_for=${p.product_id}&score_min=${p.min_score}`}>Eligible candidates</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card-body small muted">Your institution has no products in the catalog, so you can review candidates but not send offers.</div>
        )}
      </div>
    </div>
  );
}
