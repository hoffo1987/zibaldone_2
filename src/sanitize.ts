// Pulizia del contenuto degli scritti.
// Il testo di uno scritto è HTML scritto da un compagno e mostrato a chi lo legge (admin compreso):
// per questo si usa una lista di ciò che è CONSENTITO (tag, attributi, stili), non una lista di cose vietate.
// Tutto il resto viene tolto. Le funzioni non toccano mai il DOM della pagina: lavorano su un documento inerte.

const HTML_NS = "http://www.w3.org/1999/xhtml";

// Tag che l'editor può produrre (o che arrivano incollando da Word, pagine web, ecc.)
const SAFE_TAGS = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "CODE", "DIV", "EM", "FONT", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "I", "IMG",
  "LI", "OL", "P", "PRE", "S", "SPAN", "STRIKE", "STRONG", "SUB", "SUP", "TABLE", "TBODY", "TD", "TH", "THEAD", "TR", "U", "UL",
]);

// Tag pericolosi o inutili: si tolgono insieme a tutto ciò che contengono (gli altri tag sconosciuti si "aprono" e resta il testo)
const DROP_TAGS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "FRAME", "FRAMESET", "OBJECT", "EMBED", "APPLET", "LINK", "META", "BASE", "FORM", "INPUT", "BUTTON",
  "TEXTAREA", "SELECT", "OPTION", "SVG", "MATH", "TEMPLATE", "NOSCRIPT", "AUDIO", "VIDEO", "SOURCE", "TRACK", "CANVAS", "MAP", "AREA",
  "TITLE", "HEAD", "DIALOG", "PORTAL", "SLOT",
]);

// Solo queste proprietà CSS sono ammesse nell'attributo style
const SAFE_STYLE = new Set([
  "color", "background-color", "font-weight", "font-style", "text-decoration", "text-align", "width", "max-width", "height", "font-size", "cursor",
]);

// Rimuove spazi e caratteri di controllo: i browser li ignorano dentro lo schema di un link ("java\nscript:" funziona!)
const invisible = (k: number) => k <= 32 || (k >= 127 && k <= 159) || k === 173 || (k >= 8203 && k <= 8207) || k === 8232 || k === 8233 || k === 8288 || k === 65279;
const squash = (v: string) => Array.from(v).filter((c) => !invisible(c.charCodeAt(0))).join("");

const safeStyle = (css: string) => {
  const out: string[] = [];
  css.split(";").forEach((decl) => {
    const i = decl.indexOf(":");
    if (i < 1) return;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (!SAFE_STYLE.has(prop) || !val || val.length > 60) return;
    if (!/^[#a-z0-9\s.,%()+-]+$/i.test(val) || /url|expression|image|attr|var|env|calc|\\/i.test(val)) return;
    out.push(`${prop}:${val}`);
  });
  return out.join(";");
};

const safeHref = (v: string) => { const s = squash(v); return /^(https?:\/\/|mailto:|tel:)/i.test(s) ? s : ""; };
const safeSrc = (v: string) => {
  const s = squash(v);
  return /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(s) || /^https:\/\//i.test(s) ? s : "";
};
const num = (v: string) => (/^\d{1,4}$/.test(v.trim()) ? v.trim() : "");

// attributi ammessi per tag: ognuno passa da un controllo che restituisce il valore sicuro ("" = da togliere)
const ATTRS: Record<string, Record<string, (v: string) => string>> = {
  A: { href: safeHref, title: (v) => v.slice(0, 200) },
  IMG: { src: safeSrc, alt: (v) => v.slice(0, 200), width: num, height: num },
  FONT: { color: (v) => (/^[#a-z0-9(),.\s%]{1,30}$/i.test(v) ? v : ""), size: (v) => (/^[1-7]$/.test(v.trim()) ? v.trim() : "") },
  TD: { colspan: num, rowspan: num },
  TH: { colspan: num, rowspan: num },
};

const walk = (parent: Node) => {
  Array.from(parent.childNodes).forEach((n) => {
    if (n.nodeType === 3) return; // testo
    if (n.nodeType !== 1) { parent.removeChild(n); return; } // commenti, istruzioni…
    const el = n as HTMLElement, tag = el.tagName.toUpperCase();
    if (el.namespaceURI !== HTML_NS || DROP_TAGS.has(tag)) { parent.removeChild(el); return; }
    walk(el);
    if (!SAFE_TAGS.has(tag)) { // tag sconosciuto: si tiene il contenuto, si toglie il tag
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      return;
    }
    const allowed = ATTRS[tag] || {};
    Array.from(el.attributes).forEach((a) => {
      const name = a.name.toLowerCase();
      if (name === "style") {
        const s = safeStyle(a.value);
        if (s) el.setAttribute("style", s); else el.removeAttribute(a.name);
      } else if (allowed[name]) {
        const v = allowed[name](a.value);
        if (v) el.setAttribute(a.name, v); else el.removeAttribute(a.name);
      } else el.removeAttribute(a.name);
    });
    if (tag === "IMG" && !el.getAttribute("src")) { parent.removeChild(el); return; }
    if (tag === "IMG") { el.setAttribute("loading", "lazy"); el.setAttribute("decoding", "async"); el.setAttribute("referrerpolicy", "no-referrer"); }
    if (tag === "A") {
      if (!el.getAttribute("href")) { while (el.firstChild) parent.insertBefore(el.firstChild, el); parent.removeChild(el); return; }
      el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });
};

/** HTML sicuro da mostrare o salvare. */
export const clean = (h: string): string => {
  const d = new DOMParser().parseFromString(h || "", "text/html");
  walk(d.body);
  return d.body.innerHTML;
};

/** Solo il testo, con uno spazio tra un paragrafo e l'altro (così "ciao" + "mondo" sono 2 parole). */
export const plain = (h: string): string => {
  const d = new DOMParser().parseFromString(h || "", "text/html");
  d.querySelectorAll("script,style").forEach((n) => n.remove());
  d.body.querySelectorAll("br").forEach((b) => b.after(" "));
  d.body.querySelectorAll("div,p,li,tr,h1,h2,h3,h4,h5,h6,blockquote,pre").forEach((b) => b.append(" "));
  return d.body.textContent || "";
};
