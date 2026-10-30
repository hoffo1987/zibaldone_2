import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { useRail } from "./motion";
import { SectionMark } from "./SectionMark";
import { GlassMark } from "./GlassMark";
import "./navigation.css";

// The same order drives both menus and the existing directional page transitions.
export const NAV_ORDER = ["home", "my_pages", "write", "diario", "altri", "read", "podio", "authors", "profile"];

// "Scritti" is one section with two rooms: the Diary and the complete writings.
// Admins read complete writings in "read" (with evaluation), everyone else in "altri".
export const HUB = ["diario", "altri", "read"];
export const inHub = (tab: string) => HUB.includes(tab);
const completeTab = (admin: boolean) => admin ? "read" : "altri";
export const hubRooms = (admin: boolean) => [
  { id: "diario", mark: "diario", label: "Diario", detail: "Pensieri da leggere per intero", tone: "rose" },
  { id: completeTab(admin), mark: "complete", label: "Scritti completi", detail: admin ? "Lettura e valutazione" : "Estratti degli scritti del mese", tone: "violet" },
];
// The section reopens on the room visited last, also after a reload.
let lastRoom: string | null = null;
const rememberRoom = (tab: string) => {
  if (!inHub(tab) || lastRoom === tab) return;
  lastRoom = tab;
  try { localStorage.setItem("circuito:scritti", tab === "diario" ? "diario" : "complete"); } catch {}
};
export const hubEntry = (admin: boolean) => {
  let room = lastRoom ? (lastRoom === "diario" ? "diario" : "complete") : null;
  if (!room) try { room = localStorage.getItem("circuito:scritti"); } catch {}
  return room === "diario" ? "diario" : room === "complete" ? completeTab(admin) : admin ? "read" : "diario";
};

type Item = { id: string; label: string; short: string; detail: string; group: string; tone: string; mark: string; rooms?: ReturnType<typeof hubRooms> };
export const navigationItems = (admin: boolean, editing: boolean): Item[] => [
  { id: "home", label: "Panoramica", short: "Home", detail: "Il Circuito, a colpo d’occhio", group: "", tone: "teal", mark: "home" },
  { id: "my_pages", label: "I miei scritti", short: "Miei", detail: "La tua raccolta personale", group: "Il tuo spazio", tone: "blue", mark: "my_pages" },
  { id: "write", label: editing ? "Modifica scritto" : "Nuovo scritto", short: editing ? "Modifica" : "Scrivi", detail: editing ? "Riprendi la tua pagina" : "Dai forma a un’idea", group: "Il tuo spazio", tone: "teal", mark: "write" },
  { id: "scritti", label: "Scritti", short: "Scritti", detail: "Diario e scritti completi", group: "Da leggere", tone: "violet", mark: "scritti", rooms: hubRooms(admin) },
  // il podio c'è per tutti: chi non amministra lo vede coperto fino alla presentazione del mese
  { id: "podio", label: "Podio del mese", short: "Podio", detail: admin ? "Gli scritti in primo piano" : "Si scopre alla presentazione", group: "La community", tone: "amber", mark: "podio" },
  ...(admin ? [
    { id: "authors", label: "Autori", short: "Autori", detail: "Le persone del Circuito", group: "La community", tone: "cyan", mark: "authors" },
  ] : []),
];
// the navigation entry that owns a tab
const ownerOf = (tab: string) => inHub(tab) ? "scritti" : tab;

// The selection is a drop of glass: it stretches on the way (useRail delays its trailing edge) and, when that edge
// arrives, compresses once along the travel and lets go. A new trip cancels the previous settle.
const useLanding = (ref: React.RefObject<HTMLElement>, axis: "v" | "h") => useEffect(() => {
  const ind = ref.current?.querySelector<HTMLElement>(":scope > .nind"); if (!ind?.animate) return;
  const drop = () => ind.getAnimations().forEach(a => { if (a.id === "land") a.cancel(); });
  const land = (e: TransitionEvent) => {
    const d = ind.style.transitionDelay.split(",").map(parseFloat);
    if (e.target !== ind || e.propertyName !== (axis === "v" ? (d[0] > 0 ? "top" : "bottom") : (d[2] > 0 ? "left" : "right"))) return;
    const squash = axis === "v" ? ["scale(1.012, .97)", "scale(.998, 1.006)"] : ["scale(.97, 1.016)", "scale(1.006, .998)"];
    ind.animate([{ transform: squash[0] }, { transform: squash[1], offset: .62 }, { transform: "none" }], { duration: 700, easing: "cubic-bezier(.16,1,.3,1)", id: "land" });
  };
  ind.addEventListener("transitionrun", drop);
  ind.addEventListener("transitionend", land);
  return () => { ind.removeEventListener("transitionrun", drop); ind.removeEventListener("transitionend", land); };
}, [ref, axis]);

// A soft pool only while the pointer is on the glass. It sits under the pointer and fades out where it is:
// there is no resting highlight to slide back to.
const useGlassLight = (ref: React.RefObject<HTMLElement | null>) => useEffect(() => {
  const el = ref.current; if (!el) return;
  const root = el.closest(".root");
  if (root?.classList.contains("lite") || root?.classList.contains("nomotion")) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  let raf = 0, x = 0, y = 0;
  const put = () => {
    raf = 0;
    el.style.setProperty("--glx", `${x.toFixed(1)}px`);
    el.style.setProperty("--gly", `${y.toFixed(1)}px`);
    el.style.setProperty("--gl", "1");
  };
  const move = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    x = e.clientX - r.left; y = e.clientY - r.top;
    if (!raf) raf = requestAnimationFrame(put);
  };
  const rest = () => { el.style.setProperty("--gl", "0"); };
  el.addEventListener("pointermove", move, { passive: true });
  el.addEventListener("pointerleave", rest);
  return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", rest); cancelAnimationFrame(raf); el.style.removeProperty("--glx"); el.style.removeProperty("--gly"); el.style.removeProperty("--gl"); };
}, [ref]);

// The section's glass tile. When the section opens, its colour rises inside the glass like a liquid, with a few bubbles,
// and the mark turns to white glass; when you leave, the colour drains back down.
function GlassIcon({ mark }: { mark: string }) {
  return <span className="gi" aria-hidden="true">
    <span className="gi-liquid" />
    <span className="gi-bubbles"><i /><i /><i /></span>
    <GlassMark section={mark} />
    <span className="gi-sheen" />
  </span>;
}

type Props = {
  tab: string;
  admin: boolean;
  editing: boolean;
  hidden: boolean;
  railKey: string;
  onNavigate: (tab: string) => void;
  brand: React.ReactNode;
  footer: React.ReactNode;
  mobileHeader: React.ReactNode;
};

export function Navigation({ tab, admin, editing, hidden, railKey, onNavigate, brand, footer, mobileHeader }: Props) {
  const vertical = useRef<HTMLDivElement>(null), horizontal = useRef<HTMLElement>(null), side = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);
  // when the panel appears, a gleam runs down the glass tiles once
  const [boot, setBoot] = useState(true);
  useEffect(() => { const t = setTimeout(() => setBoot(false), 1600); return () => clearTimeout(t); }, []);
  useGlassLight(side);
  useGlassLight(horizontal);
  useLanding(vertical, "v");
  useLanding(horizontal, "h");
  rememberRoom(tab);
  const owner = ownerOf(tab);
  // the rail follows the section, not the room: moving between Diario and Scritti completi keeps it still
  useRail(vertical, "v", `${owner}:${railKey.slice(railKey.indexOf(":"))}`);
  useRail(horizontal, "h", `${owner}:${railKey.slice(railKey.indexOf(":"))}`);
  const items = navigationItems(admin, editing);
  const room = items.find(item => item.id === "scritti")!.rooms!.find(r => r.id === tab);
  const active = items.find(item => item.id === owner);
  const tone = (item: Item) => item.id === owner && room ? room.tone : item.tone;
  const secondary = items.filter(item => ["my_pages", "podio", "authors"].includes(item.id));
  const primary = items.filter(item => !secondary.includes(item));
  const secondaryActive = secondary.find(item => item.id === tab);
  const navigate = (id: string) => { setMore(false); onNavigate(id === "scritti" ? hubEntry(admin) : id); };
  const button = (item: Item, mobile = false) => {
    const on = owner === item.id;
    // the tour looks for the room it is showing (nav-diario / nav-read): the section answers for it
    const tour = item.id === "scritti" ? `nav-${on ? tab : "scritti"}` : `nav-${item.id}`;
    return <button key={item.id} type="button" data-act={on ? "1" : undefined}
      data-tour={mobile || item.id !== "scritti" ? tour : "nav-scritti"} data-snd="nav" data-tone={tone(item)}
      aria-current={on && (mobile || !item.rooms) ? "page" : undefined} aria-label={item.label} style={{ "--i": items.indexOf(item) } as React.CSSProperties}
      onClick={() => navigate(item.id)} className={`bt nb shell-link ${on ? "act" : ""}`}>
      <GlassIcon mark={item.mark} />
      <span className="shell-link-copy"><span className="shell-link-title">{mobile ? item.short : item.label}</span>
        {!mobile && <span className="shell-link-detail">{on && room ? room.label : item.detail}</span>}
      </span>
      {!mobile && <ChevronRight className="shell-link-arrow" size={14} aria-hidden="true" />}
    </button>;
  };
  // desktop: the two rooms sit under the section in a glass switch, always reachable in one click; a smaller drop of
  // glass marks the open one
  const rooms = (item: Item) => {
    const at = item.rooms!.findIndex(r => r.id === tab);
    return <div key={`${item.id}-rooms`} className={`shell-rooms ${owner === item.id ? "open" : ""}`} data-tone={tone(item)} data-i={at < 0 ? undefined : at}>
      <span className="shell-rooms-thumb" aria-hidden="true" />
      {item.rooms!.map(r => <button key={r.id} type="button" data-tour={`nav-${r.id}`} data-snd="nav" data-tone={r.tone}
        aria-current={tab === r.id ? "page" : undefined} aria-label={r.label} onClick={() => navigate(r.id)}
        className={`shell-room ${tab === r.id ? "act" : ""}`}>
        <span className="shell-room-dot" aria-hidden="true" /><span className="shell-room-label">{r.label}</span>
      </button>)}
    </div>;
  };
  return <>
    <aside ref={side} className={`shell-sidebar pn hidden md:flex fixed inset-y-0 left-0 flex-col z-20 ${boot ? "boot" : ""}`}>
      <div className="shell-brand">{brand}</div>
      <nav aria-label="Navigazione principale" className="shell-navigation">
        <div ref={vertical} className="shell-rail" data-tone={active && tone(active)}>
          <span className="nind" aria-hidden="true" />
          {items.map((item, index) => <React.Fragment key={item.id}>
            {item.group && item.group !== items[index - 1]?.group && <div className="shell-group"><span>{item.group}</span><span className="shell-group-line" aria-hidden="true" /></div>}
            {button(item)}
            {item.rooms && rooms(item)}
          </React.Fragment>)}
        </div>
      </nav>
      <div className="shell-footer">{footer}</div>
    </aside>
    {mobileHeader}
    <nav ref={horizontal} aria-label="Navigazione principale" data-tone={active && tone(active)}
      className={`shell-dock pn hdr md:hidden fixed z-[38] ${admin ? "shell-dock-admin" : ""}`}
      data-hidden={hidden ? "1" : undefined} aria-hidden={hidden || undefined} {...(hidden ? { inert: "" } : {})}>
      <span className="nind" aria-hidden="true" />
      {primary.map(item => button(item, true))}
      <button type="button" data-act={secondaryActive ? "1" : undefined} data-tour={`nav-${secondaryActive?.id || "more"}`} data-snd="nav"
        data-tone={secondaryActive?.tone || "cyan"} aria-label="Altre sezioni" aria-haspopup="dialog" aria-expanded={more} aria-current={secondaryActive ? "page" : undefined}
        onClick={() => setMore(true)} className={`bt nb shell-link ${secondaryActive ? "act" : ""}`}>
        <GlassIcon mark={secondaryActive?.mark || "more"} />
        <span className="shell-link-title">Altro</span>
      </button>
    </nav>
    {more && !hidden && <MobileSections onClose={() => setMore(false)}>{secondary.map(item => button(item))}</MobileSections>}
  </>;
}

function MobileSections({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {
    const panel = dialog.current, previous = document.activeElement as HTMLElement | null;
    panel?.showModal();
    panel?.querySelector<HTMLButtonElement>("button")?.focus();
    const media = window.matchMedia("(min-width:768px)");
    const resize = () => { if (media.matches) close.current(); };
    media.addEventListener("change", resize);
    return () => { media.removeEventListener("change", resize); panel?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="shell-more pn" aria-labelledby="shell-more-title" onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="shell-more-heading"><h2 id="shell-more-title" className="hd text-xl font-bold">Altre sezioni</h2><button type="button" className="bt !p-2" onClick={onClose} aria-label="Chiudi menu sezioni"><X size={18} /></button></div>
    <nav aria-label="Altre sezioni">{children}</nav>
  </dialog>;
}

// Inside the Scritti section: the two rooms side by side. The highlight slides from the room you came from.
let switchFrom = -1;
export function ScrittiSwitch({ tab, admin, onNavigate }: { tab: string; admin: boolean; onNavigate: (tab: string) => void }) {
  const rooms = hubRooms(admin), index = Math.max(0, rooms.findIndex(r => r.id === tab));
  const box = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const from = switchFrom; switchFrom = index;
    if (from < 0 || from === index) return;
    el.style.setProperty("--switch-i", String(from)); el.classList.add("still");
    void el.offsetWidth;
    el.classList.remove("still"); el.style.setProperty("--switch-i", String(index));
  }, [index]);
  return <nav ref={box} aria-label="Scritti" data-tour="scritti-switch" className="scritti-switch pn" data-tone={rooms[index].tone} style={{ "--switch-i": index } as React.CSSProperties}>
    <span className="scritti-switch-ind" aria-hidden="true" />
    {rooms.map(r => <button key={r.id} type="button" data-snd="nav" data-tone={r.tone} aria-current={tab === r.id ? "page" : undefined}
      onClick={() => { if (tab !== r.id) onNavigate(r.id); }} className={`scritti-room ${tab === r.id ? "act" : ""}`}>
      <span className="shell-icon" aria-hidden="true"><SectionMark section={r.mark} size={24} motion={false} /></span>
      <span className="scritti-room-copy"><span className="scritti-room-title">{r.label}</span><span className="scritti-room-detail">{r.detail}</span></span>
    </button>)}
  </nav>;
}

export function SectionLocation({ tab, admin, editing }: Pick<Props, "tab" | "admin" | "editing">) {
  const item = navigationItems(admin, editing).find(entry => entry.id === ownerOf(tab));
  if (!item) return null;
  const room = item.rooms?.find(r => r.id === tab);
  return <div className="shell-location" data-tone={room?.tone || item.tone}>
    <span className="shell-location-icon" aria-hidden="true"><SectionMark section={room?.mark || item.mark} size={20} motion={false} /></span>
    <span className="sl-root">Il Circuito</span><i className="sl-trace" aria-hidden="true" />
    <span className="sl-here"><i className="sl-led" aria-hidden="true" />{room ? item.label : item.group || "Panoramica"}</span>
  </div>;
}
