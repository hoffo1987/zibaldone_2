import { useCallback, useEffect, useRef, useState } from "react";

export type MusicStatus = "idle" | "playing" | "blocked" | "error";
export function useMusic(enabled: boolean, volume: number) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const preferences = useRef({ enabled, volume }); preferences.current = { enabled, volume };
  const [status, setStatus] = useState<MusicStatus>("idle");
  const play = useCallback(() => {
    if (document.hidden) return;
    const player = audio.current || (audio.current = new Audio(`${process.env.PUBLIC_URL}/audio/mii-channel-plaza.mp3`));
    player.onerror = () => { if (preferences.current.enabled) setStatus("error"); };
    player.loop = true; player.preload = "none";
    player.volume = Math.max(0, Math.min(1, preferences.current.volume));
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
  useEffect(() => { if (audio.current) audio.current.volume = Math.max(0, Math.min(1, volume)); }, [volume]);
  useEffect(() => () => {
    pause();
    if (audio.current) { audio.current.onerror = null; audio.current.removeAttribute("src"); audio.current.load(); audio.current = null; }
  }, [pause]);
  return { status, toggle, retry: play };
}
