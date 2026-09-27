import type { Tier } from "../types";

/** Semicircle gauge for the 0-1000 policy score. Tier colour comes from the API. */
export function ScoreGauge({ score, tier, size = 220, caption = "Policy credit score", light = false }: { score: number; tier: Tier; size?: number; caption?: string; light?: boolean }) {
  const r = 80;
  const c = Math.PI * r;
  const frac = Math.max(0, Math.min(1, score / 1000));
  return (
    <div style={{ width: size, textAlign: "center" }}>
      <svg viewBox="0 0 200 118" width={size} role="img" aria-label={`${caption}: ${score} out of 1000, ${tier.name}`}>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={light ? "rgba(255,255,255,0.16)" : "#eef2f6"} strokeWidth="16" strokeLinecap="round" />
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke={tier.color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
        />
        <text x="100" y="88" textAnchor="middle" fontSize="40" fontWeight="700" fill={light ? "#ffffff" : "#0f172a"} style={{ fontVariantNumeric: "tabular-nums" }}>
          {score}
        </text>
        <text x="100" y="108" textAnchor="middle" fontSize="11" fill={light ? "rgba(255,255,255,0.7)" : "#64748b"}>
          of 1000
        </text>
      </svg>
      {caption && <div className="xs" style={{ marginTop: 2, color: light ? "rgba(255,255,255,0.75)" : "var(--muted)" }}>{caption}</div>}
    </div>
  );
}
