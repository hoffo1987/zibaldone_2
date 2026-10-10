import React, { useEffect, useRef } from 'react';

interface SmoothScrollProviderProps {
  children: React.ReactNode;
  speed?: number;
  smoothWheel?: boolean;
}

/**
 * Smooth Scroll Provider - Implementazione leggera senza dipendenze esterne
 * Per una versione con Lenis, installare: npm install lenis
 */
export const SmoothScrollProvider: React.FC<SmoothScrollProviderProps> = ({
  children,
  speed = 1,
  smoothWheel = true,
}) => {
  const scrollTargetRef = useRef(0);
  const scrollCurrentRef = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!smoothWheel) return;

    let isScrolling = false;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      scrollTargetRef.current += e.deltaY * speed * 0.5;

      // Clamp scroll value
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      scrollTargetRef.current = Math.max(0, Math.min(scrollTargetRef.current, maxScroll));

      if (!isScrolling) {
        isScrolling = true;
        animate();
      }
    };

    const animate = () => {
      // Smooth interpolation
      const diff = scrollTargetRef.current - scrollCurrentRef.current;
      scrollCurrentRef.current += diff * 0.1; // Smoothing factor

      window.scrollTo(0, scrollCurrentRef.current);

      if (Math.abs(diff) > 0.1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        isScrolling = false;
        scrollCurrentRef.current = scrollTargetRef.current;
      }
    };

    // Initialize current scroll position
    scrollCurrentRef.current = window.scrollY;
    scrollTargetRef.current = window.scrollY;

    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleWheel);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [speed, smoothWheel]);

  return <>{children}</>;
};
