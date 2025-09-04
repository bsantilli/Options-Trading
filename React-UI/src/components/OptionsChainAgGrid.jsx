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

  const gridApiRef = useRef(null);
  const abortRef = useRef(null);

  // === Dark + Compact theme ===
  // Built from Quartz, add dark scheme, then tighten things up.
  // Key color params: backgroundColor, foregroundColor, accentColor (docs)  ─▶
  // https://www.ag-grid.com/javascript-data-grid/theming-colors/
  const darkCompactTheme = useMemo(
    () =>
      themeQuartz
        .withPart(colorSchemeDark)
        .withParams({
          // Colors
          backgroundColor: "#0f172a", // slate-900-ish
          foregroundColor: "#e5e7eb", // neutral-200 text
          accentColor: "#818cf8",     // indigo-300 for focus/selection
          borderColor: "#1f2937",     // slate-800-ish

          // Density / compactness
          spacing: 5,          // smaller global spacing (default is larger)
          rowHeight: 30,       // compact rows (virtualisation aware)
          headerHeight: 34,    // compact header

          // Typography
          fontSize: 16,
          fontFamily: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        }),
    []
  );

  const valueFmt = useCallback((d = 2) => (p) => fmt(p.value, d), []);
  const strikeFmt = useCallback((p) => fmtStrike(p.value), []);

  const columnDefs = useMemo(
    () => [
      {
        headerName: "Calls",
        marryChildren: true,
        children: [
          { headerName: "Bid / Sell", field: "callBid", valueFormatter: valueFmt(2), flex: 1, cellClass: "ag-center-aligned-cell" },
          { headerName: "Ask / Buy", field: "callAsk", valueFormatter: valueFmt(2), flex: 1, cellClass: "ag-center-aligned-cell" },
        ],
      },
      {
        headerName: "Strike",
        field: "strike",
        valueFormatter: strikeFmt,
        flex: 0.7,
        cellClass: ["ag-right-aligned-cell", "strike-center"],
      },
      {
        headerName: "Puts",
        marryChildren: true,
        children: [
          { headerName: "Bid / Sell", field: "putBid", valueFormatter: valueFmt(2), flex: 1, cellClass: "ag-center-aligned-cell" },
          { headerName: "Ask / Buy", field: "putAsk", valueFormatter: valueFmt(2), flex: 1, cellClass: "ag-center-aligned-cell" },
        ],
      },
    ],
    [valueFmt, strikeFmt]
  );

  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      resizable: true,
      minWidth: 100,
    }),
    []
  );

  const getRowId = useCallback((params) => String(params.data?.strike ?? params.data?.id), []);

  const onGridReady = useCallback((params) => {
    gridApiRef.current = params.api;
    params.api.sizeColumnsToFit();
    const handleResize = () => params.api.sizeColumnsToFit();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const load = useCallback(async () => {
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
      <h1 style={{ margin: "0 0 12px", fontSize: 22, color: "#e2e8f0" }}>Options Dashboard (AG Grid)</h1>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          style={{ padding: 10, fontSize: 16, borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", minWidth: 180 }}
          type="text"
          value={root}
          onChange={(e) => setRoot(e.target.value.toUpperCase())}
          placeholder="Enter ticker (e.g., AAPL)"
        />
        <input
          style={{ padding: 10, fontSize: 16, borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", minWidth: 140 }}
          type="text"
          value={exp}
          onChange={(e) => setExp(e.target.value)}
          placeholder="YYYYMMDD"
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
        <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.9, color: "#cbd5e1" }}>
          Rows: <b>{meta.count}</b> &nbsp; (root=<b>{meta.root}</b>, exp=<b>{formatExp(meta.exp)}</b>)
        </div>
      )}

      {err && (
        <div style={{ background: "#b00020", color: "white", padding: 10, borderRadius: 8, marginBottom: 12, whiteSpace: "pre-wrap" }}>
          {err}
        </div>
      )}

      {/* No theme class and no CSS imports — Theming API supplies styles */}
      <div style={{ width: "100%", height: 560 }}>
        <AgGridReact
          theme={darkCompactTheme}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          getRowId={getRowId}
          rowHeight={34}
          headerHeight={34}
          groupHeaderHeight={34}
          animateRows
        />
      </div>

      <style>{`
        /* Center/weight Strike column like your custom grid */
        .strike-center { font-weight: 600; background: #111827; color: #e5e7eb; }
      `}</style>
    </div>
  );
}
