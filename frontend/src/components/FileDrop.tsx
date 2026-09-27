import { useRef, useState, type DragEvent } from "react";

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

interface Props {
  label: string;
  hint: string;
  accept: string[];            // extensions, e.g. [".pdf", ".png"]
  file: File | null;
  onChange: (f: File | null) => void;
  optional?: boolean;
}

/** A drag-and-drop upload box that shows the chosen file, with change and remove actions. */
export default function FileDrop({ label, hint, accept, file, onChange, optional }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const take = (f: File | null | undefined) => {
    if (!f) return;
    const ok = accept.some((ext) => f.name.toLowerCase().endsWith(ext));
    if (!ok) {
      setErr(`${f.name} isn't a supported file. Use ${accept.join(", ")}.`);
      return;
    }
    setErr(null);
    onChange(f);
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files?.[0]);
  };
  const ext = file?.name.split(".").pop()?.toUpperCase() ?? "";

  return (
    <div className="filedrop-wrap">
      <div className="filedrop-label">
        {label} {optional ? <span className="muted">(optional)</span> : <span className="req">required</span>}
      </div>
      <input ref={input} type="file" hidden accept={accept.join(",")} onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
      {file ? (
        <div className="filedrop filedrop-chosen">
          <span className="filedrop-ext">{ext}</span>
          <span className="filedrop-name">
            <b>{file.name}</b>
            <span className="xs muted">{size(file.size)}</span>
          </span>
          <button type="button" className="btn btn-sm" onClick={() => input.current?.click()}>Change</button>
          <button type="button" className="filedrop-x" aria-label={`Remove ${file.name}`} onClick={() => onChange(null)}>×</button>
        </div>
      ) : (
        <button
          type="button"
          className={`filedrop${over ? " over" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          <span><b className="filedrop-cta">Choose a file</b> or drag it here</span>
          <span className="xs muted">{hint}</span>
        </button>
      )}
      {err && <div className="xs filedrop-err">{err}</div>}
    </div>
  );
}
