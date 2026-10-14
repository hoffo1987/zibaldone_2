import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Tour, { TourMode } from "./Tour";
import "../styles.css";
import "../motion.css";
import "../d3.css";

const q = new URLSearchParams(window.location.search);
const mode: TourMode = q.get("mode") === "auto" ? "auto" : q.get("mode") === "guide" ? "guide" : "film";
const targets = ["nav-home", "editor-mode", "save", "nav-my_pages", "bell", "options", "cta", "nav-read", "filters", "nav-podio", "nav-authors", "hero-actions"];

function Preview() {
  const [open, setOpen] = useState(true), [held, hold] = useState(false), [tab, nav] = useState("home");
  return <main className={`root dark ${held ? "tour-hold" : ""}`} style={{ minHeight: "100vh", padding: 24 }}>
    <h1 className="hd" style={{ fontSize: 30 }}>Presentazione · Il Circuito</h1>
    <p>Anteprima locale del componente reale. Sezione del tour: {tab}.</p>
    <p style={{ margin: "16px 0" }}><a className="bt" href="/">Studente</a>{" "}<a className="bt" href="/?admin=1">Valutatore</a>{" "}<a className="bt" href="/?calm=1">Movimento ridotto</a>{" "}<a className="bt" href="/?low=1">Qualità leggera</a>{" "}<a className="bt" href="/?mode=auto">Film e tour</a></p>
    <button className="bt on" onClick={() => setOpen(true)}>Rivedi</button>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
      {targets.map((target) => <button key={target} className="bt" data-tour={target}>{target}</button>)}
    </div>
    {open && <Tour mode={mode} admin={q.has("admin")} name={q.get("name") ?? "Andrea"} calm={q.has("calm") || matchMedia("(prefers-reduced-motion: reduce)").matches} low={q.has("low")} nav={nav} hold={hold} onDone={() => { hold(false); setOpen(false); }} />}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
