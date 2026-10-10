import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Register GSAP plugins
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface UseGSAPOptions {
  dependencies?: any[];
  revertOnUpdate?: boolean;
}

/**
 * Official useGSAP hook for React
 * Ensures proper scope management and automatic cleanup
 */
export const useGSAP = (
  callback: (context: gsap.Context) => void | (() => void),
  options: UseGSAPOptions = {}
) => {
  const { dependencies = [], revertOnUpdate = true } = options;
  const contextRef = useRef<gsap.Context | null>(null);

  useEffect(() => {
    // Create GSAP context for scoped animations
    contextRef.current = gsap.context(() => {
      callback(contextRef.current!);
    });

    // Integrate with Lenis if available
    const lenis = (window as any).lenis;
    if (lenis) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => {
        lenis.raf(time * 1000);
      });
      gsap.ticker.lagSmoothing(0);
    }

    return () => {
      if (contextRef.current) {
        contextRef.current.revert();
        contextRef.current = null;
      }

      // Clean up Lenis integration
      if (lenis) {
        lenis.off('scroll', ScrollTrigger.update);
      }
    };
  }, dependencies);

  return contextRef;
};
