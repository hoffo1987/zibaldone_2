import { useState, useEffect, useRef, useCallback } from 'react';

interface MagneticCursorState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  isHovering: boolean;
  targetElement: HTMLElement | null;
}

export const useMagneticCursor = (strength: number = 0.3, smoothness: number = 0.15) => {
  const [state, setState] = useState<MagneticCursorState>({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    isHovering: false,
    targetElement: null,
  });

  const rafRef = useRef<number>();
  const magneticElements = useRef<Set<HTMLElement>>(new Set());

  // Register an element as magnetic
  const registerElement = useCallback((element: HTMLElement) => {
    magneticElements.current.add(element);
    return () => magneticElements.current.delete(element);
  }, []);

  useEffect(() => {
    let currentX = 0;
    let currentY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      let targetElement: HTMLElement | null = null;
      let isHovering = false;

      // Check if hovering over any magnetic element
      magneticElements.current.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.hypot(mouseX - centerX, mouseY - centerY);
        const maxDistance = Math.max(rect.width, rect.height);

        if (distance < maxDistance) {
          isHovering = true;
          targetElement = element;

          // Calculate magnetic pull
          const pullX = (centerX - mouseX) * strength;
          const pullY = (centerY - mouseY) * strength;

          currentX = mouseX + pullX;
          currentY = mouseY + pullY;
        }
      });

      if (!isHovering) {
        currentX = mouseX;
        currentY = mouseY;
      }

      setState((prev) => ({
        ...prev,
        targetX: currentX,
        targetY: currentY,
        isHovering,
        targetElement,
      }));
    };

    const animate = () => {
      setState((prev) => {
        const newX = prev.x + (prev.targetX - prev.x) * smoothness;
        const newY = prev.y + (prev.targetY - prev.y) * smoothness;

        // Apply magnetic transformation to target element
        if (prev.targetElement && prev.isHovering) {
          const rect = prev.targetElement.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const deltaX = (prev.targetX - centerX) * 0.2;
          const deltaY = (prev.targetY - centerY) * 0.2;

          prev.targetElement.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.05)`;
        }

        // Reset previous element if no longer hovering
        if (!prev.isHovering && prev.targetElement) {
          prev.targetElement.style.transform = '';
        }

        return { ...prev, x: newX, y: newY };
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [strength, smoothness]);

  return { state, registerElement };
};
