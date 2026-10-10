import React, { useEffect, useRef, useState } from 'react';
import { motion, useSpring, useMotionValue } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface CustomCursorProps {
  enabled?: boolean;
  magneticElements?: string; // CSS selector
}

export const CustomCursor: React.FC<CustomCursorProps> = ({
  enabled = true,
  magneticElements = '[data-magnetic]',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const cursorRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);

  // Motion values for smooth cursor movement
  const cursorX = useMotionValue(0);
  const cursorY = useMotionValue(0);

  // Spring configuration for fluid motion
  const springConfig = { damping: 30, stiffness: 400, mass: 0.5 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);

  useEffect(() => {
    if (!enabled || prefersReducedMotion) return;

    let currentTarget: HTMLElement | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const magneticElement = target.closest(magneticElements) as HTMLElement | null;

      if (magneticElement) {
        const rect = magneticElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // Calculate magnetic attraction (cursor pulled towards center)
        const deltaX = (centerX - e.clientX) * 0.35;
        const deltaY = (centerY - e.clientY) * 0.35;

        cursorX.set(e.clientX + deltaX);
        cursorY.set(e.clientY + deltaY);

        if (!isHovering) setIsHovering(true);
        currentTarget = magneticElement;
      } else {
        cursorX.set(e.clientX);
        cursorY.set(e.clientY);

        if (isHovering) setIsHovering(false);
        currentTarget = null;
      }
    };

    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);

    // Hide default cursor
    document.body.style.cursor = 'none';

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [enabled, prefersReducedMotion, cursorX, cursorY, magneticElements, isHovering]);

  if (!enabled || prefersReducedMotion) return null;

  return (
    <>
      {/* Main cursor */}
      <motion.div
        ref={cursorRef}
        className="fixed top-0 left-0 pointer-events-none z-[9999] mix-blend-difference"
        style={{
          x: cursorXSpring,
          y: cursorYSpring,
        }}
      >
        <motion.div
          className="relative -translate-x-1/2 -translate-y-1/2"
          animate={{
            scale: isClicking ? 0.8 : isHovering ? 1.5 : 1,
          }}
          transition={{
            duration: 0.2,
            ease: 'easeOut',
          }}
        >
          {/* Outer ring */}
          <motion.div
            className="absolute w-10 h-10 border-2 rounded-full"
            style={{
              borderColor: '#17C3AE',
            }}
            animate={{
              scale: isHovering ? 1.2 : 1,
              borderWidth: isClicking ? 3 : 2,
            }}
          />

          {/* Inner dot */}
          <motion.div
            className="absolute top-1/2 left-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              backgroundColor: '#FBBF24',
            }}
            animate={{
              scale: isClicking ? 1.5 : isHovering ? 0.5 : 1,
            }}
          />

          {/* Particle effect on click */}
          {isClicking && (
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              initial={{ scale: 0, opacity: 1 }}
              animate={{ scale: 2, opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="w-10 h-10 border-2 border-[#FBBF24] rounded-full" />
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      {/* Trailing cursor (blur effect) */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9998]"
        style={{
          x: cursorX,
          y: cursorY,
        }}
      >
        <div
          className="relative -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full blur-md"
          style={{
            background: 'radial-gradient(circle, rgba(23,195,174,0.4) 0%, transparent 70%)',
          }}
        />
      </motion.div>
    </>
  );
};
