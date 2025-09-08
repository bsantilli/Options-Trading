// src/components/OptionsChainAgGrid.jsx
import { useState, useEffect } from "react";
import { getOptionsChain, getExpirations } from "../services/optionsService";
import { fmt, fmtStrike, formatExp, fmtInt } from "../utils/formatters";

// simple helpers
const fmtNum = (n, d = 2) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(d);

export default function OptionsChainAgGrid() {
  const [ticker, setTicker] = useState("");
  const [submittedTicker, setSubmittedTicker] = useState("");
  const [expirations, setExpirations] = useState([]);
  const [activeExpiry, setActiveExpiry] = useState(null);
  const [rows, setRows] = useState([]);
  const [loadingExp, setLoadingExp] = useState(false);
  const [loadingChain, setLoadingChain] = useState(false);
  const [err, setErr] = useState("");
  const [expLimit, setExpLimit] = useState("10"); // default to 10
  const [hoverIdx, setHoverIdx] = useState(null);

  // fetch expirations
  const fetchExpirations = async (symbol) => {
    if (!symbol) return;
    setLoadingExp(true);
    setErr("");
    try {
      const exps = await getExpirations(symbol);
      const normalized =
        (exps || []).map((e) =>
          typeof e === "string"
            ? { yyyymmdd: e, label: formatExp(e) }
            : { yyyymmdd: e.yyyymmdd, label: e.label || formatExp(e.yyyymmdd) }
        ) || [];
      setExpirations(normalized);
      if (normalized.length > 0) {
        setActiveExpiry(normalized[0].yyyymmdd);
      }
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoadingExp(false);
    }
  };

  // fetch chain
  useEffect(() => {
    const loadChain = async () => {
      if (!submittedTicker || !activeExpiry) return;
      setLoadingChain(true);
      setErr("");
      try {
        const data = await getOptionsChain(submittedTicker, activeExpiry);
        setRows(data.results || []);
      } catch (e) {
        setErr(String(e.message || e));
        setRows([]);
      } finally {
        setLoadingChain(false);
      }
    };
    loadChain();
  }, [submittedTicker, activeExpiry]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!ticker.trim()) return;
    const sym = ticker.trim().toUpperCase();
    setSubmittedTicker(sym);
    fetchExpirations(sym);
  };

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <h1 style={{ marginBottom: "16px" }}>Options Dashboard</h1>

      {/* Search */}
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", gap: "10px", marginBottom: "14px" }}
      >
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="Enter ticker (e.g., AAPL)"
          style={{
            padding: "10px",
            fontSize: "16px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            minWidth: "260px",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "10px 18px",
            fontSize: "16px",
            borderRadius: "8px",
            border: "none",
            backgroundColor: "#646cff",
            color: "white",
            cursor: "pointer",
            opacity: loadingExp ? 0.7 : 1,
          }}
          disabled={loadingExp}
        >
          {loadingExp ? "Loading…" : "Search Options"}
        </button>
      </form>

      {/* Expiration limit dropdown */}
      <div style={{ marginBottom: "12px" }}>
        <label style={{ marginRight: "8px", fontWeight: 500, color: "#e5e7eb" }}>
          Show expirations:
        </label>
        <select
          value={expLimit}
          onChange={(e) => setExpLimit(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            fontSize: "14px",
          }}
        >
          <option value="5">5</option>
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="all">All</option>
        </select>
      </div>


      {/* Expiration tabs */}
      {submittedTicker && expirations.length > 0 && (
        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "36px 1fr 36px",
            gap: "8px",
            alignItems: "center",
            marginBottom: "12px",
            maxWidth: "1000px",
            marginRight: "auto",
          }}
        >
          {/* Left scroll button */}
          <button
            onClick={() =>
              document.getElementById("exp-scroll-wrap")?.scrollBy({ left: -260, behavior: "smooth" })
            }
            style={{
              height: "36px",
              width: "36px",
              borderRadius: "10px",
              border: "1px solid #334155",
              background: "#0b1220",
              color: "#e5e7eb",
              cursor: "pointer",
              fontSize: "20px",
              lineHeight: 1,
            }}
          >
            ‹
          </button>

          {/* Scrollable chip row */}
          <div
            id="exp-scroll-wrap"
            style={{
              overflowX: "auto",
              overflowY: "hidden",
              whiteSpace: "nowrap",
              border: "1px solid #334155",
              borderRadius: "12px",
              background: "#0b1220",
              scrollbarWidth: "none",
            }}
          >
            <div style={{ display: "inline-flex", gap: "8px", padding: "8px" }}>
              {(expLimit === "all" ? expirations : expirations.slice(0, Number(expLimit))).map((exp) => {
                const ymd = String(exp.yyyymmdd);
                const year = Number(ymd.slice(0, 4));
                const thisYear = new Date().getFullYear();
                let label = exp.label || formatExp(exp.yyyymmdd);
                if (year !== thisYear) {
                  label = `${label} '${String(year).slice(-2)}`;
                }
                return (
                  <button
                    key={exp.yyyymmdd}
                    onClick={() => setActiveExpiry(exp.yyyymmdd)}
                    style={{
                      border: "1px solid #3a3a55",
                      backgroundColor:
                        activeExpiry === exp.yyyymmdd ? "#3a3a55" : "#2a2a40",
                      color: "white",
                      padding: "6px 10px",
                      borderRadius: "10px",
                      cursor: "pointer",
                      fontSize: "13px",
                      flex: "0 0 auto",
                    }}
                  >
                    {label}
                  </button>
                );
              })}

            </div>
          </div>

          {/* Right scroll button */}
          <button
            onClick={() =>
              document.getElementById("exp-scroll-wrap")?.scrollBy({ left: 260, behavior: "smooth" })
            }
            style={{
              height: "36px",
              width: "36px",
              borderRadius: "10px",
              border: "1px solid #334155",
              background: "#0b1220",
              color: "#e5e7eb",
              cursor: "pointer",
              fontSize: "20px",
              lineHeight: 1,
            }}
          >
            ›
          </button>
        </div>
      )}

{/* Chain */}
{submittedTicker && activeExpiry && (
  <div
    style={{
      borderRadius: "12px",
      border: "1px solid #333",
      width: "100%",
      maxWidth: "1000px",   // cap overall table width
      marginRight: "auto",  // center on wide screens
      backgroundColor: "#1b1b1b",
    }}
  >
    {/* Title bar (non-scrolling) */}
    <div
      style={{
        backgroundColor: "#1b1b1b",
        color: "white",
        padding: "10px 14px",
        borderBottom: "1px solid #333",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontWeight: 600 }}>
        {submittedTicker} Options Chain — {formatExp(activeExpiry)}
      </div>
      <div style={{ color: "#9ca3af", fontSize: 12 }}>Calls &nbsp;|&nbsp; Puts</div>
    </div>

    {/* Scrollable body (headers are sticky inside this container) */}
    <div
      style={{
        maxHeight: "60vh",         // <--- adjust to taste
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* Grouping header row (sticky) */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          display: "grid",
          gridTemplateColumns: `
            repeat(4, minmax(80px, 1fr))
            minmax(80px, 1fr)
            repeat(4, minmax(80px, 1fr))
          `,
          backgroundColor: "#1f1f2e",
          color: "white",
          fontSize: 14,
          fontWeight: 700,
          borderBottom: "1px solid #444",
        }}
      >
        <div style={{ gridColumn: "1 / span 4", textAlign: "center", padding: "8px 0" }}>
          PUTS
        </div>
        <div style={{ gridColumn: "5 / span 1", textAlign: "center", padding: "8px 0" }}>
          {formatExp(activeExpiry)}
        </div>
        <div style={{ gridColumn: "6 / span 4", textAlign: "center", padding: "8px 0" }}>
          CALLS
        </div>
      </div>

      {/* Column header row (sticky, sits under the grouping header) */}
      <div
        style={{
          position: "sticky",
          top: 36,                  // <--- match grouping row height (~36px with padding)
          zIndex: 2,
          display: "grid",
          gridTemplateColumns: `
            repeat(4, minmax(80px, 1fr))
            minmax(80px, 1fr)
            repeat(4, minmax(80px, 1fr))
          `,
          backgroundColor: "#2a2a40",
          color: "#e5e7eb",
          borderBottom: "1px solid #333",
          fontSize: 13,
        }}
      >
        <CellHeader>Open Interest</CellHeader>
        <CellHeader>Bid/Sell</CellHeader>
        <CellHeader>Mid</CellHeader>
        <CellHeader>Ask/Buy</CellHeader>
        <CellHeader center>Strike</CellHeader>
        <CellHeader>Bid/Sell</CellHeader>
        <CellHeader>Mid</CellHeader>
        <CellHeader>Ask/Buy</CellHeader>
        <CellHeader>Open Interest</CellHeader>
      </div>

      {/* Data rows (scroll within container) */}
      {loadingChain && (
        <div style={{ padding: 16, color: "#cbd5e1" }}>Loading…</div>
      )}
      {err && (
        <div
          style={{
            padding: 16,
            background: "#af2b44",
            color: "white",
            whiteSpace: "pre-wrap",
          }}
        >
          {err}
        </div>
      )}

      {!loadingChain &&
        !err &&
        rows.map((r, idx) => (
          <div
            key={r.strike}
            style={{
              display: "grid",
              gridTemplateColumns: `
                repeat(4, minmax(80px, 1fr))
                minmax(80px, 1fr)
                repeat(4, minmax(80px, 1fr))
              `,
              borderBottom: "1px solid #333",
            }}
            onMouseEnter={() => setHoverIdx(idx)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            {(() => {
              const isHover = hoverIdx === idx;
              const rowBg = idx % 2 === 0 ? "#2e2e3e" : "#242424";
              const strikeBg = "#1d2433";
              const hoverBg = "#064daaff";

              return (
                <>
                  {/* Calls (left side in your current layout) */}
                  <CellNumber bg={isHover ? hoverBg : rowBg}>{fmtInt(r.callOI)}</CellNumber>
                  <CellNumber bg={isHover ? hoverBg : rowBg}>{fmtNum(r.callBid)}</CellNumber>
                  <CellNumber bg={isHover ? hoverBg : rowBg}>
                    {r.callBid != null && r.callAsk != null ? fmtNum((r.callBid + r.callAsk) / 2) : "—"}
                  </CellNumber>
                  <CellNumber bg={isHover ? hoverBg : rowBg}>{fmtNum(r.callAsk)}</CellNumber>
                  

                  {/* Strike */}
                  <CellStrike bg={isHover ? hoverBg : strikeBg}>{fmtStrike(r.strike)}</CellStrike>

                  {/* Puts (right side) */}
                  <CellNumber bg={isHover ? hoverBg : rowBg}>{fmtNum(r.putBid)}</CellNumber>
                  <CellNumber bg={isHover ? hoverBg : rowBg}>
                    {r.putBid != null && r.putAsk != null ? fmtNum((r.putBid + r.putAsk) / 2) : "—"}
                  </CellNumber>
                  <CellNumber bg={isHover ? hoverBg : rowBg}>{fmtNum(r.putAsk)}</CellNumber>
                  <CellNumber bg={isHover ? hoverBg : rowBg}>{fmtInt(r.putOI)}</CellNumber>
                </>
              );
            })()}
          </div>
        ))}
    </div>
  </div>
)}
    </div>
  );
}

/** --- Presentational cells --- */
const baseCell = {
  padding: "10px 12px",
  borderRight: "1px solid #333",
  whiteSpace: "nowrap",
};

const CellHeader = ({ children, center }) => (
  <div
    style={{
      ...baseCell,
      fontWeight: 600,
      textAlign: "center",
    }}
  >
    {children}
  </div>
);

const CellNumber = ({ children, bg }) => (
  <div style={{ ...baseCell, textAlign: "center", backgroundColor: bg }}>{children}</div>
);

const CellStrike = ({ children, bg }) => (
  <div
    style={{
      ...baseCell,
      textAlign: "center",
      fontWeight: 600,
      backgroundColor: bg,
    }}
  >
    {children}
  </div>
);


