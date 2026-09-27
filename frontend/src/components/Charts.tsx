import type { ReactNode } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Bin } from "../types";

// SVG attributes cannot read CSS variables, so charts use literal colours.
export const CHART = {
  user: "#0f766e",
  lender: "#1d4ed8",
  income: "#16a34a",
  spend: "#2563eb",
  lifestyle: "#f59e0b",
  ml: "#7c3aed",
  neg: "#c2410c",
  grid: "#e5e9f0",
  axis: "#64748b",
};

const axis = { fontSize: 11, fill: CHART.axis };
const inrShort = (v: number) => (Math.abs(v) >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : Math.abs(v) >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`);

function Tip({ active, payload, label, fmt }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: ReactNode; fmt?: (v: number, name?: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rc-tip">
      {label !== undefined && label !== "" && <div style={{ fontWeight: 650, marginBottom: 2 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span style={{ opacity: 0.8 }}>{p.name}</span>
          <b style={{ marginLeft: "auto" }}>{fmt ? fmt(Number(p.value), p.name) : p.value}</b>
        </div>
      ))}
    </div>
  );
}

/** Monthly income vs spend (from /data-summary). */
export function CashflowChart({ months, height = 220 }: { months: { month: string; income: number; spend: number; discretionary: number }[]; height?: number }) {
  if (!months.length) return <div className="small muted">No transactions in the last 12 months.</div>;
  const data = months.map((m) => ({ month: m.month.slice(2), Income: m.income, "Essentials": Math.max(0, m.spend - m.discretionary), "Dining + shopping": m.discretionary }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 4, left: -8, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={inrShort} width={52} />
        <Tooltip cursor={{ fill: "rgba(100,116,139,.08)" }} content={<Tip fmt={(v) => "₹" + v.toLocaleString("en-IN")} />} />
        <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 11.5 }} />
        <Bar dataKey="Income" fill={CHART.income} radius={[3, 3, 0, 0]} />
        <Bar dataKey="Essentials" stackId="s" fill={CHART.spend} />
        <Bar dataKey="Dining + shopping" stackId="s" fill={CHART.lifestyle} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Stored score calculations over time. */
export function ScoreTrendChart({ points, color = CHART.user, height = 180 }: { points: { label: string; score: number }[]; color?: string; height?: number }) {
  if (points.length < 2) return <div className="small muted">Your score trend appears after the next recalculation.</div>;
  const lo = Math.max(0, Math.floor((Math.min(...points.map((p) => p.score)) - 60) / 50) * 50);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis domain={[lo, 1000]} tick={axis} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<Tip />} />
        <Area type="monotone" dataKey="score" name="Score" stroke={color} strokeWidth={2.5} fill="url(#scoreFill)" dot={{ r: 3, fill: color }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Donut of counts by category (e.g. risk tiers). */
export function DonutChart({ items, height = 220, center }: { items: { label: string; value: number; color: string }[]; height?: number; center?: ReactNode }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(0, 1fr)", alignItems: "center", gap: 12 }}>
      <div style={{ position: "relative", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<Tip fmt={(v) => `${v.toLocaleString("en-IN")} (${total ? Math.round((v / total) * 100) : 0}%)`} />} />
            <Pie data={items} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="92%" paddingAngle={1.5} stroke="none" isAnimationActive={false}>
              {items.map((i) => <Cell key={i.label} fill={i.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", textAlign: "center" }}>
          {center ?? <div><div className="big-num" style={{ fontSize: 24 }}>{total.toLocaleString("en-IN")}</div><div className="xs muted">total</div></div>}
        </div>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {items.map((i) => (
          <div key={i.label} className="row between small" style={{ gap: 8 }}>
            <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: i.color, marginRight: 6 }} />{i.label}</span>
            <span className="num"><b>{i.value.toLocaleString("en-IN")}</b> <span className="muted xs">{total ? Math.round((i.value / total) * 100) : 0}%</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Distribution bar chart from bins, with an optional cut-off reference line. */
export function DistributionChart({ bins, color = CHART.lender, height = 220, cutoff, format = (b: Bin) => `${b.from}–${b.to}`, tickFormat }: {
  bins: Bin[]; color?: string; height?: number; cutoff?: { at: number; label: string }; format?: (b: Bin) => string; tickFormat?: (b: Bin) => string;
}) {
  const data = bins.map((b) => ({ ...b, name: format(b), tick: tickFormat ? tickFormat(b) : String(b.from) }));
  const cutName = cutoff ? data.find((d) => d.from >= cutoff.at)?.tick : undefined;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 14, right: 4, left: -14, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="tick" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={44} />
        <Tooltip cursor={{ fill: "rgba(100,116,139,.08)" }} content={({ active, payload }) =>
          active && payload?.length ? <div className="rc-tip"><b>{(payload[0].payload as { name: string }).name}</b>: {Number(payload[0].value).toLocaleString("en-IN")}</div> : null} />
        <Bar dataKey="count" name="Applicants" radius={[3, 3, 0, 0]}>
          {data.map((d) => <Cell key={d.from} fill={cutoff && d.from < cutoff.at ? "#c7d0dd" : color} />)}
        </Bar>
        {cutName && <ReferenceLine x={cutName} stroke={CHART.neg} strokeDasharray="4 3" label={{ value: cutoff!.label, position: "top", fontSize: 11, fill: CHART.neg }} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Predicted vs observed rate by decile (model calibration). */
export function CalibrationChart({ deciles, height = 200 }: { deciles: { decile: number; mean_predicted: number; observed_rate: number }[]; height?: number }) {
  const data = deciles.map((d) => ({ d: `D${d.decile}`, Predicted: +(d.mean_predicted * 100).toFixed(1), Observed: +(d.observed_rate * 100).toFixed(1) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="d" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} unit="%" width={48} />
        <Tooltip content={<Tip fmt={(v) => `${v}%`} />} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 11.5 }} />
        <Line type="monotone" dataKey="Predicted" stroke={CHART.ml} strokeWidth={2} strokeDasharray="5 3" dot={false} />
        <Line type="monotone" dataKey="Observed" stroke={CHART.lender} strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Legacy CSS histogram (kept for small inline use). */
export function Histogram({ bins, color = "var(--brand)", format = (b: Bin) => `${b.from}–${b.to}` }: { bins: Bin[]; color?: string; format?: (b: Bin) => string }) {
  const max = Math.max(...bins.map((b) => b.count), 1);
  return (
    <div>
      <div className="hist" role="img" aria-label="histogram">
        {bins.map((b) => <div key={b.from} title={`${format(b)}: ${b.count}`} style={{ height: `${(b.count / max) * 100}%`, background: color }} />)}
      </div>
      <div className="hist-axis">
        <span>{format(bins[0] ?? { from: 0, to: 0, count: 0 }).split("–")[0]}</span>
        <span>{bins.length ? format(bins[bins.length - 1]).split("–")[1] : ""}</span>
      </div>
    </div>
  );
}

export function HBars({ items, color, format = (v: number) => String(v) }: {
  items: { label: string; value: number; color?: string; sub?: string }[];
  color?: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1e-9);
  return (
    <div>
      {items.map((i) => (
        <div className="hbar" key={i.label}>
          <span title={i.sub}>
            {i.label}
            {i.sub && <span className="xs muted"> {i.sub}</span>}
          </span>
          <div className="bar">
            <span style={{ width: `${(i.value / max) * 100}%`, background: i.color ?? color }} />
          </div>
          <span className="num r small">{format(i.value)}</span>
        </div>
      ))}
    </div>
  );
}
