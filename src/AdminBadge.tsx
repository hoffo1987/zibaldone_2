import React from "react";
import "./admin-badge.css";

// Firma visiva: i permessi dipendono sempre da admins/{uid}, mai dal distintivo.
export default function AdminBadge({ active = false, seal = false, featured = false }: { active?: boolean; seal?: boolean; featured?: boolean }) {
  if (!active) return null;
  return <span className={`admin-badge${seal ? " admin-seal" : ""}${featured ? " admin-featured" : ""}`} aria-label="Admin del Circuito" title="Admin del Circuito">
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 1.8 17.1 6v8L10 18.2 2.9 14V6Z" /><path d="M13.1 7.3a4.1 4.1 0 1 0 0 5.4M9 10h5" /><circle cx="14" cy="10" r="1.2" /></svg>
    {!seal && <span className="admin-badge-copy"><b>Admin</b>{featured && <small>Il Circuito</small>}</span>}
  </span>;
}
