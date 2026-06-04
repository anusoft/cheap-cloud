import { useEffect, useState } from "react";
import { Comparison } from "./Comparison";
import { Analysis } from "./Analysis";

// Hash-based routing — works on GitHub Pages with no server-side rewrite/404
// fallback. "#/analysis" → market analysis page, anything else → the grid.
export function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return hash.startsWith("#/analysis") ? <Analysis /> : <Comparison />;
}
