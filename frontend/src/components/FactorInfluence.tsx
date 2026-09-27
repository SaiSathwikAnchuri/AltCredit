import { useState } from "react";
import type { Factor, Policy } from "../types";
import { signed } from "../utils/format";

/** Component colours, shared with the charts. */
export const COMPONENT_COLOR: Record<string, string> = {
  Lifestyle: "var(--c1)",
  "Spending Behaviour": "var(--c2)",
  "Repayment Discipline": "var(--c3)",
  "Bonus / Penalty": "var(--c4)",
};
const ORDER = ["Lifestyle", "Spending Behaviour", "Repayment Discipline", "Bonus / Penalty"];

type Mode = "adds" | "costs";

const lostOf = (f: Factor) => (f.max > 0 ? Math.max(0, f.points_lost ?? f.max - f.points) : 0);
const penaltyOf = (f: Factor) => (f.points < 0 ? -f.points : 0);

/**
 * Ranks the rules by how much they moved this decision, computed only from the
 * per-rule points the engine already returned (no re-scoring).
 * "Adds most": rules ordered by points contributed. "Costs most": points missed + penalties.
 */
export function FactorInfluence({ policy, limit, title = "What drives this score", sub }: { policy: Policy; limit?: number; title?: string; sub?: string }) {
  const [mode, setMode] = useState<Mode>("adds");
  const all = policy.factors;
  const scale = Math.max(...all.map((f) => Math.max(f.max, Math.abs(f.min ?? 0), Math.abs(f.points))), 1);

  const rows =
    mode === "adds"
      ? all.filter((f) => f.points > 0).sort((a, b) => b.points - a.points)
      : all.filter((f) => lostOf(f) + penaltyOf(f) > 0).sort((a, b) => lostOf(b) + penaltyOf(b) - (lostOf(a) + penaltyOf(a)));
  const shown = limit ? rows.slice(0, limit) : rows;

  const positive = Math.max(policy.positive_points, 1);
  const comps = ORDER.filter((c) => policy.components[c]);
  const compPts = comps.map((c) => ({ c, pts: Math.max(0, policy.components[c].points) }));
  const compTotal = Math.max(compPts.reduce((s, x) => s + x.pts, 0), 1);
  const topComp = [...compPts].sort((a, b) => b.pts - a.pts)[0];
  const totalLost = rows.reduce((s, f) => s + lostOf(f) + penaltyOf(f), 0);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          <p>{sub ?? "Rules ranked by how much they moved the score, most influential first."}</p>
        </div>
        <div className="seg" role="tablist" aria-label="Ranking">
          <button className={mode === "adds" ? "on" : ""} onClick={() => setMode("adds")} role="tab" aria-selected={mode === "adds"}>Adds most</button>
          <button className={mode === "costs" ? "on" : ""} onClick={() => setMode("costs")} role="tab" aria-selected={mode === "costs"}>Costs most</button>
        </div>
      </div>
      <div className="card-body stack" style={{ gap: 12 }}>
        <div>
          <div className="row between small" style={{ marginBottom: 6 }}>
            <span className="muted">Share of earned points by component</span>
            {topComp && <span><b>{topComp.c}</b> leads with {Math.round((topComp.pts / compTotal) * 100)}%</span>}
          </div>
          <div className="comp-strip" role="img" aria-label="share of points by component">
            {compPts.map(({ c, pts }) => (
              <span key={c} title={`${c}: ${pts} pts`} style={{ width: `${(pts / compTotal) * 100}%`, background: COMPONENT_COLOR[c] }} />
            ))}
          </div>
          <div className="infl-legend" style={{ marginTop: 6 }}>
            {compPts.map(({ c, pts }) => (
              <span key={c}><i style={{ background: COMPONENT_COLOR[c] }} />{c} {pts}</span>
            ))}
          </div>
        </div>

        <div>
          {shown.length === 0 && <div className="small muted">{mode === "adds" ? "No rule has earned points yet." : "Nothing is costing points: every rule is at its maximum."}</div>}
          {shown.map((f, i) => {
            const lost = lostOf(f);
            const pen = penaltyOf(f);
            const color = COMPONENT_COLOR[f.component] ?? "var(--brand)";
            return (
              <div key={f.id} className={`infl-row ${i < 3 ? "top" : ""}`}>
                <span className="infl-rank">{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }} className="small">{f.id} {f.name}</div>
                  <div className="xs muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={f.text}>{f.value_display}</div>
                </div>
                <div className="infl-track" title={`${f.points} of ${f.max || 0}${lost ? `, ${lost} missed` : ""}`}>
                  {pen > 0 ? (
                    <span className="pen" style={{ width: `${(pen / scale) * 100}%` }} />
                  ) : (
                    <>
                      <span className="earn" style={{ width: `${(Math.max(f.points, 0) / scale) * 100}%`, background: color }} />
                      <span className="lost" style={{ width: `${(lost / scale) * 100}%` }} />
                    </>
                  )}
                </div>
                <div className="infl-val small">
                  {mode === "adds" ? (
                    <>
                      <span className="pos">+{f.points}</span>
                      <div className="xs muted">{Math.round((f.points / positive) * 100)}% of pts</div>
                    </>
                  ) : (
                    <>
                      <span className="neg">{pen ? signed(f.points) : `−${lost}`}</span>
                      <div className="xs muted">{pen ? "penalty" : "missed"}</div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {limit && rows.length > limit && <div className="xs muted" style={{ marginTop: 6 }}>+{rows.length - limit} more rule{rows.length - limit === 1 ? "" : "s"} with smaller influence</div>}
        </div>
        <div className="infl-legend">
          <span><i style={{ background: "var(--c1)" }} />earned (coloured by component)</span>
          <span><i style={{ background: "repeating-linear-gradient(45deg,#fbd5c3 0 3px,#fde7dc 3px 6px)" }} />missed</span>
          <span><i style={{ background: "var(--neg)" }} />penalty</span>
          {mode === "costs" && <span>Total room to grow: <b className="neg">{totalLost}</b> pts</span>}
        </div>
      </div>
    </div>
  );
}
