import React, { useEffect, useRef } from 'react';
import Lenis from 'lenis';

interface SmoothScrollProviderProps {
  children: React.ReactNode;
  speed?: number;
  smoothWheel?: boolean;
}

export const SmoothScrollProvider: React.FC<SmoothScrollProviderProps> = ({
  children,
  speed = 1,
  smoothWheel = true,
}) => {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // Initialize Lenis
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Custom easing
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel,
      wheelMultiplier: speed,
      touchMultiplier: 2,
      infinite: false,
    });

    lenisRef.current = lenis;

    // Animation loop
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    // Expose lenis instance globally for GSAP integration
    (window as any).lenis = lenis;

    return () => {
      lenis.destroy();
      (window as any).lenis = null;
    };
  }, [speed, smoothWheel]);

  return <>{children}</>;
};
