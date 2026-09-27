import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Empty, ErrorBox, Loading, TierBadge } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import type { ReceivedApplication } from "../../types";
import { dateTime, inr } from "../../utils/format";

const TONE: Record<string, string> = { APPROVED: "pos", PRE_APPROVED: "pos", DECLINED: "neg", MANUAL_REVIEW: "warn", UNDER_REVIEW: "brand", SUBMITTED: "brand", REFERRED: "warn" };

interface Out {
  items: ReceivedApplication[];
  by_status: Record<string, number>;
  bank_available: boolean;
}

export default function ApplicationsReceived() {
  const { data, error, loading, reload } = useApi<Out>("/api/lenders/applications");
  const nav = useNavigate();
  const [status, setStatus] = useState("");
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  const items = status ? data.items.filter((a) => a.status === status) : data.items;
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Applications received</h1>
          <p>Applicants who applied for your products. Status comes live from the bank.</p>
        </div>
        <button className="btn" onClick={reload}>Refresh</button>
      </div>
      {!data.bank_available && <div className="callout warn small">The partner bank did not respond, so some statuses may be out of date.</div>}
      <div className="chip-select">
        <button className={!status ? "on" : ""} onClick={() => setStatus("")}>All ({data.items.length})</button>
        {Object.entries(data.by_status).map(([s, n]) => (
          <button key={s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>{s.replace("_", " ")} ({n})</button>
        ))}
      </div>
      <div className="card">
        {!items.length ? (
          <Empty>No applications yet. They appear here when an applicant applies for one of your products.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Applicant</th><th>Product</th><th className="r">Score at application</th><th>Tier now</th><th>Amount · rate</th><th>Pre-approval</th><th>Bank status</th><th>Applied</th><th>Via</th></tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="clickable" onClick={() => nav(`/lender/candidates/${a.user_id}`)}>
                    <td>
                      <b>{a.contact.display_name}</b>
                      <div className="xs muted">{a.contact.masked ? <span className="mono">{a.user_id}</span> : a.contact.phone}</div>
                    </td>
                    <td>{a.product_name}<div className="xs muted">min score {a.min_score}</div></td>
                    <td className="r num">{a.score_at_application ?? "—"}</td>
                    <td>{a.tier_now && <TierBadge tier={a.tier_now} />}</td>
                    <td className="small">{a.requested_amount ? inr(a.requested_amount) : a.indicative_limit ? `limit ${inr(a.indicative_limit)}` : "—"}{a.rate != null && ` · ${a.rate}%`}</td>
                    <td>{a.preapproval_status && <Badge tone={TONE[a.preapproval_status] ?? ""}>{a.preapproval_status.replace("_", " ")}</Badge>}</td>
                    <td><Badge tone={TONE[a.status] ?? ""} dot>{a.status.replace("_", " ")}</Badge></td>
                    <td className="small">{dateTime(a.created_at)}</td>
                    <td className="xs muted">{a.offer_id ? "your offer" : "direct"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
