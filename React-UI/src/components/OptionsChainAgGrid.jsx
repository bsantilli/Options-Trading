// src/components/OptionsChainAgGrid.jsx
import { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import { getOptionsChain, getExpirations } from "../services/optionsService";
import { fmtStrike, formatExp, fmtInt } from "../utils/formatters";

// ---------- helpers ----------
const fmtNum = (n, d = 2) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(d);
const fmtPct = (n, d = 2) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : (Number(n) * 100).toFixed(d) + "%";
const formatET = (iso) => {
  if (!iso) return "";
  try {
    const dt = new Date(iso);
    return dt.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false });
  } catch {
    return String(iso);
  }
};

// Fixed/narrow columns for perfect alignment across headers/rows (6 + 1 + 6 = 13)
const COL_W = 88;      // numeric columns
const STRIKE_W = 102;  // strike column slightly wider
const GRID_COLS = `
  repeat(6, ${COL_W}px)
  ${STRIKE_W}px
  repeat(6, ${COL_W}px)
`;

export default function OptionsChainAgGrid() {
  const [ticker, setTicker] = useState("");
  const [submittedTicker, setSubmittedTicker] = useState(""); // table shows only after Load
  const [expirations, setExpirations] = useState([]);
  const [activeExpiry, setActiveExpiry] = useState(null);
  const [rows, setRows] = useState([]);
  const [underlying, setUnderlying] = useState(null);
  const [loadingExp, setLoadingExp] = useState(false);
  const [loadingChain, setLoadingChain] = useState(false);
  const [err, setErr] = useState("");

  // visible on page load
  const [expLimit, setExpLimit] = useState("10");
  const [strikeWindow, setStrikeWindow] = useState("all");

  // measure table width and sync expiration strip viewport to match
  const tableContentRef = useRef(null);
  const expViewportRef = useRef(null);
  const [expViewportWidth, setExpViewportWidth] = useState(null);
  const [showLeftBtn, setShowLeftBtn] = useState(false);
  const [showRightBtn, setShowRightBtn] = useState(false);

  const BORDER = "#2a2a2a";
  const ROW_BG = "#000000";
  const STRIKE_BG = "#0d0d0d";   // subtle contrast for strike column
  const HEAD_BG1 = "#111111";    // group header bg
  const HEAD_BG2 = "#151515";    // column labels bg
  const ITM_BORDER = "#facc15";  // yellow
  const CURRENT_BG = "#0b0b0b";  // slightly off-black for merged current price row
  const BTN_BG = "rgba(17,17,17,0.95)";

  const fetchExpirations = async (sym) => {
    setLoadingExp(true);
    setErr("");
    try {
      const list = await getExpirations(sym);
      setExpirations(list);
      setActiveExpiry(list?.[0]?.yyyymmdd || null);
    } catch (e) {
      setErr(String(e.message || e));
      setExpirations([]);
      setActiveExpiry(null);
    } finally {
      setLoadingExp(false);
    }
  };

  useEffect(() => {
    const loadChain = async () => {
      if (!submittedTicker || !activeExpiry) return;
      setLoadingChain(true);
      setErr("");
      try {
        const data = await getOptionsChain(submittedTicker, activeExpiry);
        setRows(data.results || []);
        setUnderlying(data.underlying || null);
      } catch (e) {
        setErr(String(e.message || e));
        setRows([]);
      } finally {
        setLoadingChain(false);
      }
    };
    loadChain();
  }, [submittedTicker, activeExpiry]);

  // Build display with merged "Current Price" row and optional strike windowing
  const displayRows = useMemo(() => {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const price = underlying?.price != null ? Number(underlying.price) : null;
    if (price == null) return rows;

    const out = [...rows];
    let insertIdx = out.findIndex((r) => r.strike >= price);
    if (insertIdx === -1) insertIdx = out.length;
    out.splice(insertIdx, 0, { type: "last", strike: price });

    if (strikeWindow === "all") return out;
    const N = Number(strikeWindow);
    if (!Number.isFinite(N) || N <= 0) return out;

    const side = Math.ceil(N / 2);
    const start = Math.max(insertIdx - side, 0);
    const end = Math.min(insertIdx + side + 1, out.length);
    return out.slice(start, end);
  }, [rows, underlying, strikeWindow]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!ticker.trim()) return;
    const sym = ticker.trim().toUpperCase();
    setSubmittedTicker(sym); // gate to show the table
    fetchExpirations(sym);
  };

  const showTable = Boolean(submittedTicker);

  // ----- Expiration viewport sizing & arrows -----
  const measureAndSyncExpViewport = () => {
    if (!tableContentRef.current) return;
    const w = Math.round(tableContentRef.current.getBoundingClientRect().width);
    setExpViewportWidth(w);
    requestAnimationFrame(updateArrowVisibility);
  };

  const updateArrowVisibility = () => {
    const el = expViewportRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setShowLeftBtn(scrollLeft > 0);
    setShowRightBtn(scrollLeft + clientWidth < scrollWidth - 1);
  };

  useLayoutEffect(() => {
    if (!showTable) return;
    measureAndSyncExpViewport();
    const onResize = () => measureAndSyncExpViewport();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTable, activeExpiry, rows, strikeWindow]);

  useEffect(() => {
    const el = expViewportRef.current;
    if (!el) return;
    const onScroll = () => updateArrowVisibility();
    el.addEventListener("scroll", onScroll, { passive: true });
    updateArrowVisibility();
    return () => el.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expViewportWidth]);

  const scrollExp = (dir) => {
    const el = expViewportRef.current;
    if (!el) return;
    const page = Math.max(el.clientWidth * 0.85, 300);
    el.scrollBy({ left: dir === "left" ? -page : page, behavior: "smooth" });
  };

  return (
    <div style={{ padding: 16 }}>
      {/* hide native scrollbars for the exp viewport only */}
      <style>{`
        .no-scrollbar {
          scrollbar-width: none;         /* Firefox */
          -ms-overflow-style: none;      /* IE/Edge legacy */
        }
        .no-scrollbar::-webkit-scrollbar { display: none; } /* WebKit */
      `}</style>

      {/* Search & always-visible controls */}
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          placeholder="Enter symbol (e.g., AAPL)"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${BORDER}`,
            minWidth: 320,
            color: "white",
            background: "#000",
            textTransform: "uppercase",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: 0.4,
          }}
        />
        <button
          type="submit"
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            background: "#2563eb",
            color: "white",
            border: "none",
            fontWeight: 700,
            cursor: "pointer",
            minWidth: 110,
          }}
        >
          Load
        </button>

        {/* Expirations dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontWeight: 500, color: "#e5e7eb" }}>Expirations:</label>
          <select
            value={expLimit}
            onChange={(e) => setExpLimit(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: `1px solid ${BORDER}`,
              background: "#000",
              color: "white",
            }}
          >
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="all">All</option>
          </select>
        </div>

        {/* Strikes window dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontWeight: 500, color: "#e5e7eb" }}>Strikes window:</label>
          <select
            value={strikeWindow}
            onChange={(e) => setStrikeWindow(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: `1px solid ${BORDER}`,
              background: "#000",
              color: "white",
            }}
          >
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="all">All</option>
          </select>
        </div>
      </form>

      {/* Expiration chips — after Load, left-aligned, width = table width, arrow buttons, no visible scrollbar */}
      {submittedTicker && expirations.length > 0 && (
        <div
          style={{
            margin: "8px 0 16px 0",
            borderRadius: 10,
            border: `1px solid ${BORDER}`,
            background: "#000",
            padding: 8,
          }}
        >
          <div
            style={{
              position: "relative",
              width: expViewportWidth ? `${expViewportWidth}px` : "auto", // EXACT width of table
              maxWidth: "100%",
            }}
          >
            {/* viewport — left aligned (no centering), scrollbar hidden via class */}
            <div
              ref={expViewportRef}
              className="no-scrollbar"
              style={{
                overflowX: "auto",         // still scrollable, but scrollbar hidden
                overflowY: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              <div style={{ display: "inline-flex", gap: 8, paddingBottom: 2 }}>
                {(expLimit === "all" ? expirations : expirations.slice(0, Number(expLimit))).map((ex) => (
                  <button
                    key={ex.yyyymmdd}
                    onClick={() => setActiveExpiry(ex.yyyymmdd)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 20,
                      border: activeExpiry === ex.yyyymmdd ? "2px solid #0b3a74ff" : `1px solid ${BORDER}`,
                      background: activeExpiry === ex.yyyymmdd ? "#0a0a0a" : "#000",
                      color: "white",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      fontSize: 13,
                      flex: "0 0 auto",
                    }}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>

            {/* left/right scroll buttons (only when needed), hugging the edges */}
            {showLeftBtn && (
              <button
                type="button"
                onClick={() => scrollExp("left")}
                aria-label="Scroll expirations left"
                style={arrowBtnStyle("left", BTN_BG)}
              >
                ‹
              </button>
            )}
            {showRightBtn && (
              <button
                type="button"
                onClick={() => scrollExp("right")}
                aria-label="Scroll expirations right"
                style={arrowBtnStyle("right", BTN_BG)}
              >
                ›
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== TABLE: only render after Load ===== */}
      {submittedTicker && (
        <div
          style={{
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            overflow: "hidden",
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
            backgroundColor: "#000",
            width: "100%",
          }}
        >
          {/* Title bar */}
          <div
            style={{
              backgroundColor: "#000",
              color: "white",
              padding: "10px 14px",
              borderBottom: `1px solid ${BORDER}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
                {submittedTicker} Options Chain — {formatExp(activeExpiry)}
              </div>
              {underlying && (
                <div
                  style={{
                    background: "#07360aff",
                    color: "white",
                    padding: "4px 8px",
                    borderRadius: 8,
                    fontWeight: 400,
                  }}
                >
                  Last ${fmtNum(underlying.price)}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right", color: "#9ca3af", fontSize: 12 }}>
              {underlying && <>As of {formatET(underlying.timestamp)} ET</>}
            </div>
          </div>

          {/* Scrollable body (vertical only) */}
          <div style={{ maxHeight: "64vh", overflowY: "auto" }}>
            {/* CONTENT SHELL: ensures headers & rows share the same exact width */}
            <div ref={tableContentRef} style={{ width: "max-content" }}>
              {/* Sticky header wrapper MUST match content width */}
              <div style={{ position: "sticky", top: 0, zIndex: 3, background: "#000", width: "max-content" }}>
                {/* Group header */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: GRID_COLS,
                    padding: "6px 0 2px 0",
                    color: "#e5e7eb",
                    backgroundColor: HEAD_BG1,
                    borderBottom: `1px solid ${BORDER}`,
                    fontSize: 16,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    width: "max-content",
                  }}
                >
                  <div style={{ gridColumn: "1 / span 6", textAlign: "center", letterSpacing: 1 }}>Calls</div>
                  <div style={{ gridColumn: "7 / span 1", textAlign: "center" }} />
                  <div style={{ gridColumn: "8 / span 6", textAlign: "center", letterSpacing: 1 }}>Puts</div>
                </div>

                {/* Column labels */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: GRID_COLS,
                    padding: "0",
                    color: "#e5e7eb",
                    backgroundColor: HEAD_BG2,
                    borderBottom: `1px solid ${BORDER}`,
                    fontSize: 12,
                    width: "max-content",
                  }}
                >
                  <CellHeader nowrap>IV %</CellHeader>
                  <CellHeader nowrap>Volume</CellHeader>
                  <CellHeader nowrap>Open Int</CellHeader>
                  <CellHeader nowrap>Bid/Sell</CellHeader>
                  <CellHeader nowrap>Mid</CellHeader>
                  <CellHeader nowrap>Ask/Buy</CellHeader>
                  <CellHeader nowrap center>Strike</CellHeader>
                  <CellHeader nowrap>Bid/Sell</CellHeader>
                  <CellHeader nowrap>Mid</CellHeader>
                  <CellHeader nowrap>Ask/Buy</CellHeader>
                  <CellHeader nowrap>Open Int</CellHeader>
                  <CellHeader nowrap>Volume</CellHeader>
                  <CellHeader nowrap>IV %</CellHeader>
                </div>
              </div>

              {loadingChain && <div style={{ padding: 16, color: "#cbd5e1" }}>Loading…</div>}
              {err && (
                <div style={{ padding: 16, background: "#7f1d1d", color: "white", whiteSpace: "pre-wrap" }}>{err}</div>
              )}

              {!loadingChain &&
                !err &&
                displayRows.map((r, idx) => {
                  const p = underlying?.price ?? null;

                  // ITM indicator on strike cell borders
                  const strikeStyle = {};
                  if (p != null && r.type !== "last") {
                    const callITM = r.strike <= p;
                    const putITM = r.strike >= p;
                    if (callITM) strikeStyle.borderLeft = `3px solid ${ITM_BORDER}`;
                    if (putITM) strikeStyle.borderRight = `3px solid ${ITM_BORDER}`;
                  }

                  if (r.type === "last") {
                    // Single merged cell row spanning all 13 columns
                    return (
                      <div
                        key={`last-${idx}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: GRID_COLS,
                          borderBottom: `1px solid ${BORDER}`,
                          backgroundColor: CURRENT_BG,
                          width: "max-content",
                        }}
                      >
                        <div
                          style={{
                            ...baseCell,
                            gridColumn: "1 / -1",
                            fontWeight: 700,
                            textAlign: "center",
                            borderRight: "none",
                          }}
                        >
                          Current Price: ${fmtNum(r.strike)}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={r.strike}
                      style={{
                        display: "grid",
                        gridTemplateColumns: GRID_COLS,
                        borderBottom: `1px solid ${BORDER}`,
                        backgroundColor: ROW_BG,
                        width: "max-content",
                      }}
                    >
                      {/* Calls (left) */}
                      <CellNumber>{fmtPct(r.callIV)}</CellNumber>
                      <CellNumber>{fmtInt(r.callVol ?? null)}</CellNumber>
                      <CellNumber>{fmtInt(r.callOI)}</CellNumber>
                      <CellNumber>{fmtNum(r.callBid)}</CellNumber>
                      <CellNumber>
                        {r.callBid != null && r.callAsk != null ? fmtNum((r.callBid + r.callAsk) / 2) : "—"}
                      </CellNumber>
                      <CellNumber>{fmtNum(r.callAsk)}</CellNumber>

                      {/* Strike (contrasting bg + potential ITM borders) */}
                      <CellStrike style={strikeStyle}>{fmtStrike(r.strike)}</CellStrike>

                      {/* Puts (right) */}
                      <CellNumber>{fmtNum(r.putBid)}</CellNumber>
                      <CellNumber>
                        {r.putBid != null && r.putAsk != null ? fmtNum((r.putBid + r.putAsk) / 2) : "—"}
                      </CellNumber>
                      <CellNumber>{fmtNum(r.putAsk)}</CellNumber>
                      <CellNumber>{fmtInt(r.putOI)}</CellNumber>
                      <CellNumber>{fmtInt(r.putVol ?? null)}</CellNumber>
                      <CellNumber>{fmtPct(r.putIV)}</CellNumber>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Presentational helpers ---------- */
const baseCell = {
  padding: "8px 10px",         // identical in header & data -> alignment
  borderRight: "1px solid #2a2a2a",
  minWidth: 60,
  textAlign: "center",
  color: "#E5E7EB",
  whiteSpace: "nowrap",
};

const CellHeader = ({ children }) => (
  <div
    style={{
      ...baseCell,
      fontWeight: 700,
      background: "transparent",
    }}
  >
    {children}
  </div>
);

const CellNumber = ({ children }) => (
  <div
    style={{
      ...baseCell,
      backgroundColor: "#000",
    }}
  >
    {children}
  </div>
);

const CellStrike = ({ children, style = {} }) => (
  <div
    style={{
      ...baseCell,
      fontWeight: 600,
      backgroundColor: "#0d0d0d",
      ...style,
    }}
  >
    {children}
  </div>
);

// arrow button style helper (inside the container, aligned to its edges)
function arrowBtnStyle(side, bg) {
  const common = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 28,
    height: 28,
    borderRadius: "9999px",
    border: "1px solid #333",
    background: bg,
    color: "#e5e7eb",
    fontSize: 18,
    lineHeight: "26px",
    textAlign: "center",
    cursor: "pointer",
    userSelect: "none",
  };
  return side === "left"
    ? { ...common, left: 6, boxShadow: "2px 0 6px rgba(0,0,0,0.4)" }
    : { ...common, right: 6, boxShadow: "-2px 0 6px rgba(0,0,0,0.4)" };
}
