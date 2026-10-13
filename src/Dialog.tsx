import React, { useEffect, useRef } from "react";

export function SettingsDialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]') || []).filter(el => el.getClientRects().length);
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); previous?.focus(); };
  }, []);
  return <div className="fade fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/60" onClick={onClose}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="settings-title" className="settings-panel pn w-full max-w-md max-h-[90dvh] overflow-y-auto p-5 pop !rounded-b-none md:!rounded-b-[18px]" onClick={event => event.stopPropagation()}>{children}</div>
  </div>;
}
