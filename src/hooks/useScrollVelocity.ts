import { useState, useEffect, useRef } from 'react';

interface ScrollVelocity {
  velocity: number;
  direction: 'up' | 'down' | 'idle';
  scrollY: number;
  progress: number; // 0 to 1
}

export const useScrollVelocity = (smoothing: number = 0.1): ScrollVelocity => {
  const [state, setState] = useState<ScrollVelocity>({
    velocity: 0,
    direction: 'idle',
    scrollY: 0,
    progress: 0,
  });

  const lastScrollY = useRef(0);
  const lastTimestamp = useRef(performance.now());
  const velocityRef = useRef(0);

  useEffect(() => {
    let rafId: number;

    const updateScroll = () => {
      const now = performance.now();
      const currentScrollY = window.scrollY;
      const deltaTime = Math.max(now - lastTimestamp.current, 1);
      const deltaScroll = currentScrollY - lastScrollY.current;

      // Calculate instantaneous velocity (pixels per millisecond)
      const instantVelocity = deltaScroll / deltaTime;

      // Smooth velocity with exponential moving average
      velocityRef.current = velocityRef.current * (1 - smoothing) + instantVelocity * smoothing;

      // Calculate progress (0-1)
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.min(Math.max(currentScrollY / maxScroll, 0), 1) : 0;

      // Determine direction
      let direction: 'up' | 'down' | 'idle' = 'idle';
      if (Math.abs(velocityRef.current) > 0.01) {
        direction = velocityRef.current > 0 ? 'down' : 'up';
      }

      setState({
        velocity: velocityRef.current,
        direction,
        scrollY: currentScrollY,
        progress,
      });

      lastScrollY.current = currentScrollY;
      lastTimestamp.current = now;

      rafId = requestAnimationFrame(updateScroll);
    };

    rafId = requestAnimationFrame(updateScroll);

    return () => cancelAnimationFrame(rafId);
  }, [smoothing]);

  return state;
};
