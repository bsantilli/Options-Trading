// src/hooks/useOptionsChain.js
import { useCallback, useMemo, useRef, useState } from "react";
import { getOptionsChain } from "../services/optionsService";

export function useOptionsChain(initialRoot = "AAPL", initialExp = "20250905") {
  const [root, setRoot] = useState(initialRoot);
  const [exp, setExp] = useState(initialExp);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const abortRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    setRows([]);
    setMeta(null);

    // cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const data = await getOptionsChain(root, exp, { signal: abortRef.current.signal });
      setRows(data.results || []);
      setMeta({ root: data.root, exp: data.exp, count: data.count });
    } catch (e) {
      if (e.name !== "AbortError") setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [root, exp]);

  const display = useMemo(() => rows, [rows]);

  return { root, setRoot, exp, setExp, rows, display, meta, loading, err, load };
}
