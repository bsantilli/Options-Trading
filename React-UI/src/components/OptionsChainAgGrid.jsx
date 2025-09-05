// src/components/OptionsChainAgGrid.jsx
import { getOptionsChain } from "../services/optionsService";
import { fmt, fmtStrike, formatExp } from "../utils/formatters";
import { useCallback, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";

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
  const [exp, setExp] = useState("20250905");
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [rowData, setRowData] = useState([]);
  const [requested, setRequested] = useState(false);

  const gridApiRef = useRef(null);
  const abortRef = useRef(null);

  // === Theme (compact + dark) ===
  const darkCompactTheme = useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const get = (v, fb) => (css.getPropertyValue(v)?.trim() || fb);

    return themeQuartz
      .withPart(colorSchemeDark)
      .withParams({
        backgroundColor: get("--surface", "#1e2630"),
        foregroundColor: get("--text", "#e6edf3"),
        accentColor: get("--accent", "#2f81f7"),
        borderColor: get("--border", "#30363d"),
        spacing: 3,     // was 4
        rowHeight: 30,  // was 32
        headerHeight: 36,
        fontSize: 14,   // smaller text fits smaller cols
        fontFamily: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
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
      cellClass: "oc-center",          // center cell contents
      headerClass: "oc-header-center", // center header labels
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
        { headerName: "Bid / Sell", field: "callBid", valueFormatter: valueFmt(2), width: 88, maxWidth: 100 },
        {
          headerName: "Mid",
          valueGetter: (p) => {
            const b = p.data?.callBid, a = p.data?.callAsk;
            return b == null || a == null ? null : (b + a) / 2;
          },
          valueFormatter: valueFmt(2),
          width: 88, maxWidth: 100,
        },
        { headerName: "Ask / Buy", field: "callAsk", valueFormatter: valueFmt(2), width: 88, maxWidth: 100 },
      ],
    },
    {
      headerName: "Strike",
      field: "strike",
      valueFormatter: strikeFmt,
      width: 76, maxWidth: 84,
      cellClass: "strike-center",
      headerClass: "oc-header-center strike-header",
    },
    {
      headerName: "Puts",
      marryChildren: true,
      headerGroupClass: "oc-header-center",
      children: [
        { headerName: "Bid / Sell", field: "putBid", valueFormatter: valueFmt(2), width: 88, maxWidth: 100 },
        {
          headerName: "Mid",
          valueGetter: (p) => {
            const b = p.data?.putBid, a = p.data?.putAsk;
            return b == null || a == null ? null : (b + a) / 2;
          },
          valueFormatter: valueFmt(2),
          width: 88, maxWidth: 100,
        },
        { headerName: "Ask / Buy", field: "putAsk", valueFormatter: valueFmt(2), width: 88, maxWidth: 100 },
      ],
    },
  ],
  [valueFmt, strikeFmt]
);


  const getRowId = useCallback((params) => String(params.data?.strike ?? params.data?.id), []);

const onGridReady = useCallback((params) => {
  gridApiRef.current = params.api;
}, []);

  const load = useCallback(async () => {
    setRequested(true);
    setLoading(true);
    setErr("");
    setRowData([]);
    setMeta(null);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const data = await getOptionsChain(root, exp, { signal: abortRef.current.signal });
      setRowData(data.results || []);
      setMeta({ root: data.root, exp: data.exp, count: data.count });
      setTimeout(() => gridApiRef.current?.sizeColumnsToFit(), 0);
    } catch (e) {
      if (e.name !== "AbortError") setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [root, exp]);

  return (
    <div style={{ width: "100%", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
      <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Options Chain</h1>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          style={{ padding: 10, fontSize: 16, borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", minWidth: 180 }}
          type="text"
          value={root}
          onChange={(e) => setRoot(e.target.value.toUpperCase())}
          placeholder="Enter ticker (e.g., AAPL)"
          onKeyDown={(e) => { if (e.key === "Enter") load(); }}
        />
        <input
          style={{ padding: 10, fontSize: 16, borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", minWidth: 140 }}
          type="text"
          value={exp}
          onChange={(e) => setExp(e.target.value)}
          placeholder="YYYYMMDD"
          onKeyDown={(e) => { if (e.key === "Enter") load(); }}
        />
        <button
          style={{ padding: "10px 18px", fontSize: 16, borderRadius: 8, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", opacity: loading ? 0.7 : 1 }}
          onClick={load}
          disabled={loading}
        >
          {loading ? "Loading…" : "Load Chain"}
        </button>
      </div>

      {meta && (
        <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.9, color: "#444" }}>
          Rows: <b>{meta.count}</b> &nbsp; (root=<b>{meta.root}</b>, exp=<b>{formatExp(meta.exp)}</b>)
        </div>
      )}

      {err && (
        <div style={{ background: "#b00020", color: "white", padding: 10, borderRadius: 8, marginBottom: 12, whiteSpace: "pre-wrap" }}>
          {err}
        </div>
      )}

{requested && !loading && !err && rowData.length > 0 && (
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

      {!loading && !err && rowData.length === 0 && (
        <div style={{ opacity: 0.8, padding: 16, border: "1px dashed #334155", borderRadius: 8, color: "#444" }}>
          No rows yet. Enter a root/exp and click <b>Load Chain</b>.
        </div>
      )}

      {/* Scoped styles for this grid */}
<style>{`
  /* Narrow, responsive grid viewport */
  .oc-grid-wrap {
    /* pick a target max width; adjust to taste */
    max-width: 650px;         /* <- table won't exceed this */
    width: min(94vw, 860px);  /* <- responsive: up to 94% of viewport */
    /*margin: 8px auto 0;        center it horizontally */
  }

  /* If you want even slimmer:  width: min(92vw, 760px); or  clamp(560px, 65vw, 820px) */

  /* Keep the rest of your table styles… */
  .oc-ag .oc-center { display:flex; align-items:center; justify-content:center; padding: 0 4px; }
  .oc-ag .oc-header-center .ag-header-cell-label { justify-content: center; }
  .oc-ag .ag-header-group-cell.oc-header-center .ag-header-group-cell-label {
    display:flex; align-items:center; justify-content:center !important; width:100%; text-align:center;
  }
  .oc-ag .ag-row-odd .ag-cell { background: #171e27; }
  .oc-ag .ag-row-hover .ag-cell { background: #1c2430; }
  .oc-ag .strike-center {
    font-weight:700; background:#141a22; color:#e6edf3;
    box-shadow: inset 2px 0 0 #f59e0b, inset -1px 0 0 #30363d;
  }
  .oc-ag .strike-header .ag-header-cell-label { font-weight:700; }
`}</style>


    </div>
  );
}
