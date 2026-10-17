import React, { useRef } from "react";
import { LayoutDashboard, Files, Feather, NotebookPen, LibraryBig, Trophy, Users, ChevronRight } from "lucide-react";
import { useRail } from "./motion";
import "./navigation.css";

// The same order drives both menus and the existing directional page transitions.
export const NAV_ORDER = ["home", "my_pages", "write", "diario", "altri", "read", "podio", "authors", "profile"];
export const navigationItems = (admin: boolean, editing: boolean) => [
  { id: "home", label: "Panoramica", short: "Home", detail: "Il Circuito, a colpo d’occhio", group: "", tone: "teal", icon: LayoutDashboard },
  { id: "my_pages", label: "I miei scritti", short: "I miei scritti", detail: "La tua raccolta personale", group: "Il tuo spazio", tone: "blue", icon: Files },
  { id: "write", label: editing ? "Modifica scritto" : "Nuovo scritto", short: editing ? "Modifica" : "Scrivi", detail: editing ? "Riprendi la tua pagina" : "Dai forma a un’idea", group: "Il tuo spazio", tone: "teal", icon: Feather },
  { id: "diario", label: "Diario", short: "Diario", detail: "Pensieri e voci anonime", group: "Da leggere", tone: "rose", icon: NotebookPen },
  { id: admin ? "read" : "altri", label: "Scritti completi", short: "Scritti", detail: admin ? "Lettura e valutazione" : "Esplora gli estratti", group: "Da leggere", tone: "violet", icon: LibraryBig },
  ...(admin ? [
    { id: "podio", label: "Podio del mese", short: "Podio", detail: "Gli scritti in primo piano", group: "La community", tone: "amber", icon: Trophy },
    { id: "authors", label: "Autori", short: "Autori", detail: "Le persone del Circuito", group: "La community", tone: "cyan", icon: Users },
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
  useRail(vertical, "v", railKey);
  useRail(horizontal, "h", railKey);
  const items = navigationItems(admin, editing);
  const active = items.find(item => item.id === tab);
  const button = (item: typeof items[number], mobile = false) => (
    <button key={item.id} type="button" data-act={tab === item.id ? "1" : undefined}
      data-tour={`nav-${item.id}`} data-snd="nav" data-tone={item.tone}
      aria-current={tab === item.id ? "page" : undefined} aria-label={item.label}
      onClick={() => onNavigate(item.id)} className={`bt nb shell-link ${tab === item.id ? "act" : ""}`}>
      <span className="shell-icon" aria-hidden="true"><item.icon size={20} strokeWidth={1.8} /></span>
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
            {item.group && item.group !== items[index - 1]?.group && <div className="shell-group">{item.group}</div>}
            {button(item)}
          </React.Fragment>)}
        </div>
      </nav>
      <div className="shell-footer">{footer}</div>
    </aside>
    {mobileHeader}
    <nav ref={horizontal} aria-label="Navigazione principale" data-tone={active?.tone}
      className={`shell-dock pn hdr md:hidden fixed z-30 ${admin ? "shell-dock-admin" : ""}`}
      style={{ display: hidden ? "none" : undefined }}>
      <span className="nind" aria-hidden="true" />
      {items.map(item => button(item, true))}
    </nav>
  </>;
}

export function SectionLocation({ tab, admin, editing }: Pick<Props, "tab" | "admin" | "editing">) {
  const item = navigationItems(admin, editing).find(entry => entry.id === tab);
  if (!item) return null;
  return <div className="shell-location" data-tone={item.tone}>
    <span className="shell-location-icon" aria-hidden="true"><item.icon size={15} /></span>
    <span>Il Circuito</span><ChevronRight size={12} aria-hidden="true" />
    <span>{item.group || "Panoramica"}</span>
  </div>;
}
