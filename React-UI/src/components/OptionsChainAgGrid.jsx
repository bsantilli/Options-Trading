// src/components/OptionsChainAgGrid.jsx
import { useCallback, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { getOptionsChain, getExpirations } from "../services/optionsService";
import { fmt, fmtStrike, formatExp } from "../utils/formatters";

// AG Grid (modules + theming API)
import {
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
  colorSchemeDark,
} from "ag-grid-community";
ModuleRegistry.registerModules([AllCommunityModule]);

export default function OptionsChainAgGrid() {
  const [root, setRoot] = useState("AAPL");

  // expirations & selection
  const [expirations, setExpirations] = useState([]); // [{ yyyymmdd, label? }]
  const [activeExp, setActiveExp] = useState(null);

  // chain/meta/loading/errors
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState("");
  const [loadingExp, setLoadingExp] = useState(false);
  const [loadingChain, setLoadingChain] = useState(false);
  const [rowData, setRowData] = useState([]);
  const [requested, setRequested] = useState(false);

  const gridApiRef = useRef(null);
  const abortChainRef = useRef(null);
  const abortExpRef = useRef(null);
  const scrollWrapRef = useRef(null); // for the horiz scroller

  // === Theme (compact + dark) ===
  const darkCompactTheme = useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const get = (v, fb) => (css.getPropertyValue(v)?.trim() || fb);

    return themeQuartz
      .withPart(colorSchemeDark)
      .withParams({
        backgroundColor: get("--surface", "#0f1115"),
        foregroundColor: get("--text", "#e5e7eb"),
        accentColor: get("--accent", "#3335c7"),
        borderColor: get("--border", "#334155"),
        spacing: 3,
        rowHeight: 30,
        headerHeight: 36,
        fontSize: 14,
        fontFamily: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Arial",
          "sans-serif",
        ],
      });
  }, []);

  // formatters
  const valueFmt = useCallback((d = 2) => (p) => fmt(p.value, d), []);
  const strikeFmt = useCallback((p) => fmtStrike(p.value), []);

  // default: center everything
  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      resizable: true,
      minWidth: 50,
      width: 75,
      cellClass: "oc-center",
      headerClass: "oc-header-center",
    }),
    []
  );

  // columns with Mid on both sides; center Strike visually
  const columnDefs = useMemo(
    () => [
      {
        headerName: "Calls",
        marryChildren: true,
        headerGroupClass: "oc-header-center",
        children: [
          {
            headerName: "Bid / Sell",
            field: "callBid",
            valueFormatter: valueFmt(2),
            width: 88,
            maxWidth: 100,
          },
          {
            headerName: "Mid",
            valueGetter: (p) => {
              const b = p.data?.callBid,
                a = p.data?.callAsk;
              return b == null || a == null ? null : (b + a) / 2;
            },
            valueFormatter: valueFmt(2),
            width: 88,
            maxWidth: 100,
          },
          {
            headerName: "Ask / Buy",
            field: "callAsk",
            valueFormatter: valueFmt(2),
            width: 88,
            maxWidth: 100,
          },
        ],
      },
      {
        headerName: "Strike",
        field: "strike",
        valueFormatter: strikeFmt,
        width: 76,
        maxWidth: 84,
        cellClass: "strike-center",
        headerClass: "oc-header-center strike-header",
      },
      {
        headerName: "Puts",
        marryChildren: true,
        headerGroupClass: "oc-header-center",
        children: [
          {
            headerName: "Bid / Sell",
            field: "putBid",
            valueFormatter: valueFmt(2),
            width: 88,
            maxWidth: 100,
          },
          {
            headerName: "Mid",
            valueGetter: (p) => {
              const b = p.data?.putBid,
                a = p.data?.putAsk;
              return b == null || a == null ? null : (b + a) / 2;
            },
            valueFormatter: valueFmt(2),
            width: 88,
            maxWidth: 100,
          },
          {
            headerName: "Ask / Buy",
            field: "putAsk",
            valueFormatter: valueFmt(2),
            width: 88,
            maxWidth: 100,
          },
        ],
      },
    ],
    [valueFmt, strikeFmt]
  );

  const getRowId = useCallback(
    (params) => String(params.data?.strike ?? params.data?.id),
    []
  );

  const onGridReady = useCallback((params) => {
    gridApiRef.current = params.api;
  }, []);

  // === Load expirations for a symbol ===
  const fetchExpirations = useCallback(async () => {
    if (!root.trim()) return;
    setErr("");
    setLoadingExp(true);
    setExpirations([]);
    setActiveExp(null);
    setRowData([]);
    setMeta(null);
    setRequested(false);

    if (abortExpRef.current) abortExpRef.current.abort();
    abortExpRef.current = new AbortController();

    try {
      const exps = await getExpirations(root.trim().toUpperCase(), {
        signal: abortExpRef.current.signal,
      });
      // normalize to { yyyymmdd, label }
      const normalized =
        (exps || []).map((e) =>
          typeof e === "string"
            ? { yyyymmdd: e, label: formatExp(e) }
            : {
              yyyymmdd: e.yyyymmdd,
              label: e.label || formatExp(e.yyyymmdd),
            }
        ) || [];

      setExpirations(normalized);

      // auto-select the first expiration (optional)
      if (normalized.length > 0) {
        setActiveExp(normalized[0].yyyymmdd);
        // auto-load chain for the first expiration (optional)
        await loadChain(root.trim().toUpperCase(), normalized[0].yyyymmdd);
      }
    } catch (e) {
      if (e.name !== "AbortError") setErr(String(e.message || e));
    } finally {
      setLoadingExp(false);
    }
  }, [root]);

  // === Load chain for (root, exp) ===
  const loadChain = useCallback(
    async (rootSym, exp) => {
      setRequested(true);
      setLoadingChain(true);
      setErr("");
      setRowData([]);
      setMeta(null);

      if (abortChainRef.current) abortChainRef.current.abort();
      abortChainRef.current = new AbortController();

      try {
        const data = await getOptionsChain(rootSym, exp, {
          signal: abortChainRef.current.signal,
        });
        setRowData(data.results || []);
        setMeta({ root: data.root, exp: data.exp, count: data.count });
        setTimeout(() => gridApiRef.current?.sizeColumnsToFit(), 0);
      } catch (e) {
        if (e.name !== "AbortError") setErr(String(e.message || e));
      } finally {
        setLoadingChain(false);
      }
    },
    []
  );

  // user clicks an expiration chip
  const onPickExpiration = useCallback(
    async (yyyymmdd) => {
      if (yyyymmdd === activeExp) return;
      setActiveExp(yyyymmdd);
      await loadChain(root.trim().toUpperCase(), yyyymmdd);
    },
    [activeExp, loadChain, root]
  );

  // horiz scroll helpers
  const scrollExpLeft = useCallback(() => {
    const el = scrollWrapRef.current;
    if (el) el.scrollBy({ left: -260, behavior: "smooth" });
  }, []);

  const scrollExpRight = useCallback(() => {
    const el = scrollWrapRef.current;
    if (el) el.scrollBy({ left: 260, behavior: "smooth" });
  }, []);

  return (
    <div
      style={{
        width: "100%",
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      }}
    >
      <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Options Chain</h1>

      {/* Symbol search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          fetchExpirations();
        }}
        style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}
      >
        <input
          style={{
            padding: 10,
            fontSize: 16,
            borderRadius: 8,
            border: "1px solid #334155",
            background: "#0b1220",
            color: "#e5e7eb",
            minWidth: 180,
          }}
          type="text"
          value={root}
          onChange={(e) => setRoot(e.target.value.toUpperCase())}
          placeholder="Enter ticker (e.g., AAPL)"
          onKeyDown={(e) => {
            if (e.key === "Enter") fetchExpirations();
          }}
        />

        <button
          type="submit"
          style={{
            padding: "10px 18px",
            fontSize: 16,
            borderRadius: 8,
            border: "none",
            background: "#3335c7",
            color: "#fff",
            cursor: "pointer",
            opacity: loadingExp ? 0.7 : 1,
          }}
          disabled={loadingExp}
          title="Fetch available expirations"
        >
          {loadingExp ? "Loading Exp…" : "Search"}
        </button>
      </form>

      {/* Expirations: horizontally scrollable chip list */}
      {expirations.length > 0 && (
        <div className="exp-row">
          <button
            className="exp-scroll-btn"
            onClick={scrollExpLeft}
            aria-label="scroll left"
            title="Scroll left"
          >
            ‹
          </button>

          <div className="exp-scroll-wrap" ref={scrollWrapRef}>
            <div className="exp-chips">
              {expirations.map((e) => {
                const isActive = activeExp === e.yyyymmdd;

                // derive label
                const rawLabel = e.label || formatExp(e.yyyymmdd);

                // check year
                const ymd = String(e.yyyymmdd);
                const expYear = Number(ymd.slice(0, 4));
                const todayYear = new Date().getFullYear();

                let displayLabel = rawLabel;
                if (expYear !== todayYear) {
                  const shortYear = String(expYear).slice(-2); // e.g. "2026" -> "26"
                  displayLabel = `${rawLabel} '${shortYear}`;
                }

                return (
                  <button
                    key={e.yyyymmdd}
                    onClick={() => onPickExpiration(e.yyyymmdd)}
                    className={`exp-chip ${isActive ? "active" : ""}`}
                    title={formatExp(e.yyyymmdd)}
                  >
                    {displayLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            className="exp-scroll-btn"
            onClick={scrollExpRight}
            aria-label="scroll right"
            title="Scroll right"
          >
            ›
          </button>
        </div>
      )}

      {/* Meta */}
      {meta && (
        <div
          style={{
            marginTop: 8,
            marginBottom: 8,
            fontSize: 12,
            opacity: 0.9,
            color: "#cbd5e1",
          }}
        >
          Rows: <b>{meta.count}</b> &nbsp;(root=<b>{meta.root}</b>, exp=
          <b>{formatExp(meta.exp)}</b>)
        </div>
      )}

      {/* Errors */}
      {err && (
        <div
          style={{
            background: "#af2b44",
            color: "white",
            padding: 10,
            borderRadius: 8,
            marginTop: 8,
            marginBottom: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          {err}
        </div>
      )}

      {/* Grid */}
      {requested && !loadingChain && !err && rowData.length > 0 && (
        <div className="oc-grid-wrap">
          <div className="oc-ag" style={{ width: "100%", height: 560 }}>
            <AgGridReact
              theme={darkCompactTheme}
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              onGridReady={onGridReady}
              getRowId={getRowId}
              rowHeight={32}
              headerHeight={38}
              groupHeaderHeight={38}
              animateRows
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loadingChain && !err && requested && rowData.length === 0 && (
        <div
          style={{
            opacity: 0.8,
            padding: 16,
            border: "1px dashed #334155",
            borderRadius: 8,
            color: "#94a3b8",
            marginTop: 8,
          }}
        >
          No option rows for {root} on {formatExp(activeExp)}.
        </div>
      )}

      {/* Pre-search helper */}
      {!requested && expirations.length === 0 && !loadingExp && (
        <div
          style={{
            opacity: 0.8,
            padding: 16,
            border: "1px dashed #334155",
            borderRadius: 8,
            color: "#94a3b8",
            marginTop: 8,
          }}
        >
          Enter a symbol and click <b>Search</b> to fetch expirations.
        </div>
      )}

      {/* Scoped styles (grid + expirations row) */}
      <style>{`
  /* Grid viewport kept narrow + responsive */
  .oc-grid-wrap {
    max-width: 850px;
    width: min(75vw, 860px);
  }

  .oc-ag .oc-center { display:flex; align-items:center; justify-content:center; padding: 0 4px; }
  .oc-ag .oc-header-center .ag-header-cell-label { justify-content: center; }
  .oc-ag .ag-header-group-cell.oc-header-center .ag-header-group-cell-label {
    display:flex; align-items:center; justify-content:center !important; width:100%; text-align:center;
  }
  .oc-ag .ag-row-odd .ag-cell { background: #0b0f14; }
  .oc-ag .ag-row-hover .ag-cell { background: #1c2e4e; }
  .oc-ag .strike-center {
    font-weight:700; background:#141a22; color:#e6edf3;
    box-shadow: inset 2px 0 0 #af7208, inset -1px 0 0 #ce7808;
  }
  .oc-ag .strike-header .ag-header-cell-label { font-weight:700; }

  /* Expirations row */
  .exp-row {
    position: relative;
    display: grid;
    grid-template-columns: 36px 1fr 36px;
    gap: 8px;
    align-items: center;
    margin: 6px 0 10px;
  }

  .exp-scroll-btn {
    height: 36px;
    width: 36px;
    border-radius: 10px;
    border: 1px solid #334155;
    background: #0b1220;
    color: #e5e7eb;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
  }
  .exp-scroll-btn:hover { background: #111827; }

  .exp-scroll-wrap {
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    border: 1px solid #334155;
    border-radius: 12px;
    background: #0b1220;
  }

  .exp-chips {
    display: inline-flex;
    gap: 8px;
    padding: 8px;
    white-space: nowrap;
    min-height: 52px; /* keeps it roomy if many rows wrap vertically in future */
  }

  .exp-chip {
    border: 1px solid #3a3a55;
    background: #1f2937;
    color: #e5e7eb;
    padding: 6px 10px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 13px;
    transition: background 120ms ease, transform 80ms ease;
  }
  .exp-chip:hover { background: #2a2a40; transform: translateY(-1px); }
  .exp-chip.active { background: #3335c7; border-color: #3335c7; color: white; }
      `}</style>
    </div>
  );
}
