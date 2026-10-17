import React, { useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, MoreHorizontal, X } from "lucide-react";
import { useRail } from "./motion";
import { SectionMark } from "./SectionMark";
import "./navigation.css";

// The same order drives both menus and the existing directional page transitions.
export const NAV_ORDER = ["home", "my_pages", "write", "diario", "altri", "read", "podio", "authors", "profile"];
export const navigationItems = (admin: boolean, editing: boolean) => [
  { id: "home", label: "Panoramica", short: "Home", detail: "Il Circuito, a colpo d’occhio", group: "", tone: "teal" },
  { id: "my_pages", label: "I miei scritti", short: "Miei", detail: "La tua raccolta personale", group: "Il tuo spazio", tone: "blue" },
  { id: "write", label: editing ? "Modifica scritto" : "Nuovo scritto", short: editing ? "Modifica" : "Scrivi", detail: editing ? "Riprendi la tua pagina" : "Dai forma a un’idea", group: "Il tuo spazio", tone: "teal" },
  { id: "diario", label: "Diario", short: "Diario", detail: "Pensieri e voci anonime", group: "Da leggere", tone: "rose" },
  { id: admin ? "read" : "altri", label: "Scritti completi", short: "Scritti", detail: admin ? "Lettura e valutazione" : "Esplora gli estratti", group: "Da leggere", tone: "violet" },
  ...(admin ? [
    { id: "podio", label: "Podio del mese", short: "Podio", detail: "Gli scritti in primo piano", group: "La community", tone: "amber" },
    { id: "authors", label: "Autori", short: "Autori", detail: "Le persone del Circuito", group: "La community", tone: "cyan" },
  ] : []),
];

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
  const vertical = useRef<HTMLDivElement>(null), horizontal = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);
  useRail(vertical, "v", railKey);
  useRail(horizontal, "h", railKey);
  const items = navigationItems(admin, editing);
  const active = items.find(item => item.id === tab);
  const secondary = items.filter(item => ["my_pages", "podio", "authors"].includes(item.id));
  const primary = items.filter(item => !secondary.includes(item));
  const secondaryActive = secondary.find(item => item.id === tab);
  const navigate = (id: string) => { setMore(false); onNavigate(id); };
  const button = (item: typeof items[number], mobile = false) => (
    <button key={item.id} type="button" data-act={tab === item.id ? "1" : undefined}
      data-tour={`nav-${item.id}`} data-snd="nav" data-tone={item.tone}
      aria-current={tab === item.id ? "page" : undefined} aria-label={item.label}
      onClick={() => navigate(item.id)} className={`bt nb shell-link ${tab === item.id ? "act" : ""}`}>
      <span className="shell-icon" aria-hidden="true"><span className="shell-icon-orbit" /><SectionMark key={`${item.id}:${tab === item.id}`} section={item.id} /></span>
      <span className="shell-link-copy"><span className="shell-link-title">{mobile ? item.short : item.label}</span>
        {!mobile && <span className="shell-link-detail">{item.detail}</span>}
      </span>
      {!mobile && <ChevronRight className="shell-link-arrow" size={14} aria-hidden="true" />}
    </button>
  );
  return <>
    <aside className="shell-sidebar pn hidden md:flex fixed inset-y-0 left-0 flex-col z-20">
      <div className="shell-brand">{brand}</div>
      <nav aria-label="Navigazione principale" className="shell-navigation">
        <div ref={vertical} className="shell-rail" data-tone={active?.tone}>
          <span className="nind" aria-hidden="true" />
          {items.map((item, index) => <React.Fragment key={item.id}>
            {item.group && item.group !== items[index - 1]?.group && <div className="shell-group"><span>{item.group}</span><span className="shell-group-line" aria-hidden="true" /></div>}
            {button(item)}
          </React.Fragment>)}
        </div>
      </nav>
      <div className="shell-footer">{footer}</div>
    </aside>
    {mobileHeader}
    <nav ref={horizontal} aria-label="Navigazione principale" data-tone={active?.tone}
      className={`shell-dock pn hdr md:hidden fixed z-30 ${admin ? "shell-dock-admin" : ""}`}
      data-hidden={hidden ? "1" : undefined} aria-hidden={hidden || undefined} {...(hidden ? { inert: "" } : {})}>
      <span className="nind" aria-hidden="true" />
      {primary.map(item => button(item, true))}
      <button type="button" data-act={secondaryActive ? "1" : undefined} data-tour={`nav-${secondaryActive?.id || "more"}`} data-snd="nav"
        data-tone={secondaryActive?.tone || "cyan"} aria-label="Altre sezioni" aria-haspopup="dialog" aria-expanded={more} aria-current={secondaryActive ? "page" : undefined}
        onClick={() => setMore(true)} className={`bt nb shell-link ${secondaryActive ? "act" : ""}`}>
        <span className="shell-icon" aria-hidden="true">{secondaryActive ? <SectionMark section={secondaryActive.id} /> : <MoreHorizontal size={22} />}</span>
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

export function SectionLocation({ tab, admin, editing }: Pick<Props, "tab" | "admin" | "editing">) {
  const item = navigationItems(admin, editing).find(entry => entry.id === tab);
  if (!item) return null;
  return <div className="shell-location" data-tone={item.tone}>
    <span className="shell-location-icon" aria-hidden="true"><SectionMark section={item.id} size={20} motion={false} /></span>
    <span>Il Circuito</span><ChevronRight size={12} aria-hidden="true" />
    <span>{item.group || "Panoramica"}</span>
  </div>;
}
