import React from "react";
import "./admin-badge.css";

// Il sigillo dell'Admin: una moneta d'oro coniata con la C del Circuito, incastonata in una capsula di vetro scuro con
// il filo d'oro, e la parola «Admin» in foglia d'oro. Sul profilo è più grande, su un fondo inciso a guilloché come i
// certificati, con «del Circuito» sotto; sull'avatar resta la sola moneta. Al passaggio la moneta gira su sé stessa e
// una luce attraversa il vetro; a riposo è ferma. Firma visiva soltanto: i permessi dipendono sempre da admins/{uid}.
export default function AdminBadge({ active = false, seal = false, featured = false }: { active?: boolean; seal?: boolean; featured?: boolean }) {
  if (!active) return null;
  return <span className={`admin-badge${seal ? " admin-seal" : ""}${featured ? " admin-featured" : ""}`} role="img" aria-label="Admin del Circuito" title="Admin del Circuito">
    <span className="ab-coin" aria-hidden="true">
      <span className="ab-face">
        <svg viewBox="0 0 20 20" fill="none"><path className="ab-c" d="M13.4 6.6a4.6 4.6 0 1 0 0 6.8" /><path className="ab-t" d="M10.2 10h4.6" /><circle className="ab-dot" cx="15.4" cy="10" r="1.25" /></svg>
      </span>
    </span>
    {!seal && <span className="ab-copy" aria-hidden="true"><b>Admin</b>{featured && <small>del Circuito</small>}</span>}
  </span>;
}
