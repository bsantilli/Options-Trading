// src/components/OptionsChain.jsx
import { useMemo } from "react";
import "./OptionsChain.css";
import { fmt, fmtStrike, formatExp } from "../utils/formatters";
import { useOptionsChain } from "../hooks/useOptionsChain";

export default function OptionsChain() {
  const {
    root, setRoot,
    exp, setExp,
    display, meta, loading, err, load
  } = useOptionsChain("AAPL", "20250905");

  return (
    <div className="oc-wrap">
      <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Options Dashboard</h1>

      <div className="oc-controls">
        <input
          className="oc-input"
          style={{ minWidth: 180 }}
          type="text"
          value={root}
          onChange={(e) => setRoot(e.target.value.toUpperCase())}
          placeholder="Enter ticker (e.g., AAPL)"
        />
        <input
          className="oc-input"
          style={{ minWidth: 140 }}
          type="text"
          value={exp}
          onChange={(e) => setExp(e.target.value)}
          placeholder="YYYYMMDD"
        />
        <button className="oc-btn" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Load Chain"}
        </button>
      </div>

      {meta && (
        <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.85 }}>
          Rows: <b>{meta.count}</b> &nbsp; (root=<b>{meta.root}</b>, exp=<b>{formatExp(meta.exp)}</b>)
        </div>
      )}

      {err && (
        <div style={{ background: "#b00020", color: "white", padding: 10, borderRadius: 8, marginBottom: 12, whiteSpace: "pre-wrap" }}>
          {err}
        </div>
      )}

      {!loading && !err && display.length > 0 && (
        <div className="oc-card">
          <div className="oc-titlebar">
            <div style={{ fontWeight: 600 }}>
              {meta?.root || root} Options Chain — {formatExp(meta?.exp || exp)}
            </div>
            <div className="oc-subtle">Calls &nbsp;|&nbsp; Puts</div>
          </div>

          <div className="oc-grid oc-header">
            <div className="oc-cell">Bid / Sell</div>
            <div className="oc-cell">Ask / Buy</div>
            <div className="oc-cell center">Strike</div>
            <div className="oc-cell">Bid / Sell</div>
            <div className="oc-cell">Ask / Buy</div>
          </div>

          <div className="oc-body">
            {display.map((r, idx) => (
              <div className="oc-grid oc-row" key={`${r.strike}:${idx}`}>
                <div className="oc-cell">{fmt(r.callBid)}</div>
                <div className="oc-cell">{fmt(r.callAsk)}</div>
                <div className="oc-cell center">{fmtStrike(r.strike)}</div>
                <div className="oc-cell">{fmt(r.putBid)}</div>
                <div className="oc-cell">{fmt(r.putAsk)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !err && display.length === 0 && (
        <div style={{ opacity: 0.8, padding: 16, border: "1px dashed #aaa", borderRadius: 8, color: "#444" }}>
          No rows yet. Enter a root/exp and click <b>Load Chain</b>.
        </div>
      )}
    </div>
  );
}
