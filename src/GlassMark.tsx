import React, { useId } from "react";

// Section icons for the glass sidebar. Each one is built from two or three layers of glass: a pale layer behind, a
// solid layer in front with light falling from above and a bright edge on top, and an amber detail where the old mark
// had one. The colours come from CSS (navigation.css, .gi): the section's colour on clear glass, white on the tinted
// tile of the open section.
export function GlassMark({ section }: { section: string }) {
  const id = "gm" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const f = `url(#${id}f)`, b = `url(#${id}b)`, a = `url(#${id}a)`, h = `url(#${id}h)`;
  const front = { fill: f, stroke: h, strokeWidth: 0.7 }, back = { fill: b }, acc = { fill: a, stroke: h, strokeWidth: 0.6 };
  let parts: React.ReactNode;
  switch (section) {
    case "home":
      parts = <>
        <circle className="gm-back" cx="14.5" cy="16" r="3.4" {...back} />
        <g className="gm-front"><path {...front} d="M21.5 8.2A10.5 10.5 0 1 0 21.5 23.8 1.95 1.95 0 0 0 18.9 20.9 6.6 6.6 0 1 1 18.9 11.1 1.95 1.95 0 0 0 21.5 8.2Z" />
          <rect {...front} x="13.5" y="14.5" width="10" height="3" rx="1.5" /></g>
        <circle className="gm-acc" cx="25" cy="16" r="3" {...acc} />
      </>;
      break;
    case "my_pages":
      parts = <>
        <g className="gm-back"><rect x="5" y="8.5" width="14" height="19" rx="2.6" transform="rotate(-11 12 18)" {...back} />
          <rect x="7.5" y="6.5" width="14" height="19" rx="2.6" transform="rotate(-5 14.5 16)" {...back} /></g>
        <g className="gm-front"><path {...front} d="M13 4.5h7.6l5.9 5.9v15.1a2.5 2.5 0 0 1-2.5 2.5H13a2.5 2.5 0 0 1-2.5-2.5V7a2.5 2.5 0 0 1 2.5-2.5Z" />
          <path className="gm-line" d="M14.2 14.5h8.2M14.2 18.5h8.2M14.2 22.5h5" /></g>
        <path className="gm-acc" {...acc} d="M20.6 4.5v4a1.9 1.9 0 0 0 1.9 1.9h4Z" />
      </>;
      break;
    case "write":
      parts = <>
        <rect className="gm-back" x="4" y="24.6" width="20" height="3.2" rx="1.6" {...back} />
        <g className="gm-front"><g transform="rotate(42 16 15)"><rect {...front} x="12.6" y="0.8" width="6.8" height="18" rx="2.6" />
          <path {...front} d="M12.6 19.4h6.8L16 27.6Z" /><path className="gm-line" d="M16 21.5v3" /></g></g>
        <rect className="gm-acc" x="4" y="24.6" width="9" height="3.2" rx="1.6" {...acc} />
      </>;
      break;
    case "diario":
      parts = <>
        <rect className="gm-back" x="8.5" y="5.5" width="18" height="23" rx="3.2" {...back} />
        <g className="gm-front"><rect {...front} x="5.5" y="3.5" width="18" height="23" rx="3.2" />
          <path className="gm-line" d="M9.5 3.8v22.4M13 11h6.5M13 15h6.5M13 19h4" /></g>
        <path className="gm-acc" {...acc} d="M17.5 3.5h4.2v9.5l-2.1-1.6-2.1 1.6Z" />
      </>;
      break;
    case "complete":
      parts = <>
        <g className="gm-back"><rect x="9" y="6.5" width="16" height="21" rx="2.6" transform="rotate(7 17 17)" {...back} /></g>
        <g className="gm-front"><path {...front} d="M9 3.5h8.6l5.9 5.9v16.1a2.5 2.5 0 0 1-2.5 2.5H9a2.5 2.5 0 0 1-2.5-2.5V6A2.5 2.5 0 0 1 9 3.5Z" />
          <path className="gm-line" d="M10.2 13.5h9.2M10.2 17.5h9.2M10.2 21.5h5.5" /></g>
        <circle className="gm-acc" cx="23.4" cy="24.4" r="3.6" {...acc} />
      </>;
      break;
    case "podio":
      parts = <>
        <rect className="gm-back" x="3.5" y="16.5" width="8.5" height="11" rx="2" {...back} />
        <rect className="gm-back" x="20" y="19.5" width="8.5" height="8" rx="2" {...back} />
        <g className="gm-front"><rect {...front} x="11" y="12" width="10" height="15.5" rx="2" /><path className="gm-line" d="M16 16v7" /></g>
        <path className="gm-acc" {...acc} d="M12.2 9.4 13 4.6l2.2 2.1L16 3.2l.8 3.5L19 4.6l.8 4.8a.8.8 0 0 1-.8.8h-6a.8.8 0 0 1-.8-.8Z" />
      </>;
      break;
    case "authors":
      parts = <>
        <g className="gm-back" {...back}><circle cx="7.5" cy="11.5" r="3.3" /><path d="M1.8 24.5a5.7 5.7 0 0 1 11.4 0v1H1.8Z" />
          <circle cx="24.5" cy="11.5" r="3.3" /><path d="M18.8 24.5a5.7 5.7 0 0 1 11.4 0v1H18.8Z" /></g>
        <g className="gm-front"><circle {...front} cx="16" cy="9.5" r="4.6" /><path {...front} d="M8.2 27.5v-1.3a7.8 7.8 0 0 1 15.6 0v1.3Z" /></g>
        <rect className="gm-acc" x="13" y="21.8" width="6" height="2.4" rx="1.2" {...acc} />
      </>;
      break;
    case "more": // the mobile bar's «Altro»: three drops of glass on a pale bar
      parts = <>
        <rect className="gm-back" x="3" y="11.5" width="26" height="9" rx="4.5" {...back} />
        <g className="gm-front"><circle {...front} cx="8.5" cy="16" r="3.1" /><circle {...front} cx="16" cy="16" r="3.1" /><circle {...front} cx="23.5" cy="16" r="3.1" /></g>
      </>;
      break;
    default: // scritti: the books of both rooms
      parts = <>
        <rect className="gm-back" x="3.5" y="8" width="6.4" height="19.5" rx="1.8" {...back} />
        <g className="gm-front"><rect {...front} x="10.6" y="4.5" width="7" height="23" rx="1.8" />
          <rect {...front} x="19" y="8" width="6.4" height="19.5" rx="1.8" transform="rotate(13 22.2 27.5)" /><path className="gm-line" d="M12.6 9h3M12.6 23h3" /></g>
        <rect className="gm-acc" x="3.5" y="12" width="6.4" height="2.4" rx=".6" {...acc} />
      </>;
  }
  return <svg className="gm" width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" focusable="false" data-mark={section}>
    <defs>
      <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1"><stop className="gm-f1" /><stop className="gm-f2" offset="1" /></linearGradient>
      <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop className="gm-b1" /><stop className="gm-b2" offset="1" /></linearGradient>
      <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1"><stop className="gm-a1" /><stop className="gm-a2" offset="1" /></linearGradient>
      <linearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1"><stop className="gm-h1" /><stop className="gm-h2" offset=".55" /></linearGradient>
    </defs>
    {parts}</svg>;
}
