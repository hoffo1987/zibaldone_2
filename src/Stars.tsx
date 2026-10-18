import React from "react";
import { Star } from "lucide-react";
import "./stars.css";

type Props = { v?: number; onSet?: (value: number) => void; size?: number };
const label = (v: number) => v ? `${v.toLocaleString("it-IT")} su 5 stelle` : "Senza voto";

export default function Stars({ v = 0, onSet, size = 16 }: Props) {
  const choose = (value: number) => onSet?.(v === value ? 0 : value);
  return (
    <div className={`rating-stars${onSet ? " editable" : ""}`} role={onSet ? "slider" : "img"}
      aria-label={onSet ? "Voto in stelle" : label(v)} tabIndex={onSet ? 0 : undefined}
      aria-valuemin={onSet ? 0 : undefined} aria-valuemax={onSet ? 5 : undefined}
      aria-valuenow={onSet ? v : undefined} aria-valuetext={onSet ? label(v) : undefined}
      title={onSet ? "Metà sinistra: mezza stella. Metà destra: stella intera. Ripeti il voto per toglierlo." : label(v)}
      onClick={onSet ? e => e.stopPropagation() : undefined}
      onKeyDown={onSet ? e => {
        let next: number;
        switch (e.key) {
          case "ArrowRight": case "ArrowUp": next = Math.min(5, v + 0.5); break;
          case "ArrowLeft": case "ArrowDown": next = Math.max(0, v - 0.5); break;
          case "Home": case "Delete": case "Backspace": next = 0; break;
          case "End": next = 5; break;
          default: return;
        }
        e.preventDefault(); e.stopPropagation(); onSet(next);
      } : undefined}>
      {[1, 2, 3, 4, 5].map(n => {
        const fill = Math.min(1, Math.max(0, v - n + 1));
        return <span key={n} className="rating-star-target" aria-hidden="true"
          style={onSet ? { width: Math.max(size, 28), minHeight: Math.max(size, 32) } : undefined}
          onClick={onSet ? e => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            choose(e.clientX - rect.left < rect.width / 2 ? n - 0.5 : n);
            e.currentTarget.parentElement?.focus({ preventScroll: true });
          } : undefined}>
          <span key={fill} className={`rating-star${fill ? " st-on" : ""}`} style={{ width: size, height: size, ["--n" as string]: n }}>
            <Star size={size} style={{ color: "var(--mu)", opacity: 0.35 }} />
            {fill > 0 && <span className="rating-star-fill" style={{ width: `${fill * 100}%` }}>
              <Star size={size} style={{ fill: "var(--am)", color: "var(--am)" }} />
            </span>}
          </span>
        </span>;
      })}
      {onSet && <span className="rating-value" aria-hidden="true">{v ? v.toLocaleString("it-IT") : "—"}<small>/5</small></span>}
    </div>
  );
}
