import { useCallback, useEffect, useRef, useState } from "react";
import { duckLevel, onDuck } from "./sound";

export type MusicStatus = "idle" | "playing" | "blocked" | "error";
// Su iPhone e iPad il volume di un elemento audio non si può cambiare da codice: lì, invece di abbassarsi, la musica fa una pausa.
let fixedVolume: boolean | null = null;
const volumeLocked = () => {
  if (fixedVolume === null) { try { const a = new Audio(); a.volume = 0.5; fixedVolume = Math.abs(a.volume - 0.5) > 0.01; } catch { fixedVolume = false; } }
  return fixedVolume;
};
export function useMusic(enabled: boolean, volume: number) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const preferences = useRef({ enabled, volume }); preferences.current = { enabled, volume };
  const [status, setStatus] = useState<MusicStatus>("idle");
  // livello del ducking (1 = piena) e dissolvenza in corso verso il volume giusto
  const duck = useRef(duckLevel()), fade = useRef(0), held = useRef(false);
  const target = () => Math.max(0, Math.min(1, preferences.current.volume * duck.current));
  const play = useCallback(() => {
    if (document.hidden || held.current) return;
    const player = audio.current || (audio.current = new Audio(`${process.env.PUBLIC_URL}/audio/mii-channel-plaza.mp3`));
    player.onerror = () => { if (preferences.current.enabled) setStatus("error"); };
    player.loop = true; player.preload = "none";
    player.volume = target();
    if (!player.paused) return;
    const attempt = ++generation.current;
    player.play().then(() => {
      if (attempt === generation.current) setStatus("playing");
    }).catch((error: DOMException) => {
      if (attempt === generation.current) setStatus(error.name === "NotAllowedError" ? "blocked" : "error");
    });
  }, []);
  const pause = useCallback(() => { generation.current++; audio.current?.pause(); }, []);
  // Call directly from the settings button, preserving the browser's user gesture.
  const toggle = useCallback((on: boolean) => {
    preferences.current.enabled = on;
    if (on) play(); else { pause(); setStatus("idle"); }
  }, [pause, play]);
  useEffect(() => {
    if (!enabled) { pause(); setStatus("idle"); return; }
    play();
    const visibility = () => { if (document.hidden) pause(); else play(); };
    const unlock = () => { if (audio.current?.paused) play(); };
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      pause();
    };
  }, [enabled, pause, play]);
  useEffect(() => { if (audio.current) audio.current.volume = target(); }, [volume]);
  // ducking: la musica scende in 350 ms quando parte un momento sonoro e risale in 1,2 s quando finisce
  useEffect(() => onDuck((k) => {
    const down = k < duck.current; duck.current = k;
    const player = audio.current; if (!player) return;
    if (volumeLocked()) {
      const hold = k < 0.5;
      if (hold && !held.current) { held.current = true; if (!player.paused) pause(); }
      else if (!hold && held.current) { held.current = false; if (preferences.current.enabled) play(); }
      return;
    }
    cancelAnimationFrame(fade.current);
    const from = player.volume, to = target(), ms = down ? 350 : 1200, t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      player.volume = Math.max(0, Math.min(1, from + (to - from) * e));
      if (p < 1) fade.current = requestAnimationFrame(step);
    };
    fade.current = requestAnimationFrame(step);
  }), [pause, play]);
  useEffect(() => () => {
    pause(); cancelAnimationFrame(fade.current);
    if (audio.current) { audio.current.onerror = null; audio.current.removeAttribute("src"); audio.current.load(); audio.current = null; }
  }, [pause]);
  return { status, toggle, retry: play };
}
