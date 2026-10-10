import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface PageTransitionContextType {
  transitionTo: (page: string, clickX?: number, clickY?: number) => void;
  currentPage: string;
  isTransitioning: boolean;
}

const PageTransitionContext = createContext<PageTransitionContextType | null>(null);

export const usePageTransition = () => {
  const context = useContext(PageTransitionContext);
  if (!context) {
    throw new Error('usePageTransition must be used within PageTransitionProvider');
  }
  return context;
};

interface PageTransitionProviderProps {
  children: React.ReactNode;
  initialPage?: string;
}

export const PageTransitionProvider: React.FC<PageTransitionProviderProps> = ({
  children,
  initialPage = 'home',
}) => {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const clickPositionRef = useRef({ x: 0.5, y: 0.5 }); // Normalized coordinates

  const transitionTo = useCallback((page: string, clickX?: number, clickY?: number) => {
    if (isTransitioning || page === currentPage) return;

    // Store click position for circular reveal
    if (clickX !== undefined && clickY !== undefined) {
      clickPositionRef.current = {
        x: clickX / window.innerWidth,
        y: clickY / window.innerHeight,
      };
    }

    // Set CSS variables for View Transitions API
    document.documentElement.style.setProperty('--vx', `${clickPositionRef.current.x * 100}%`);
    document.documentElement.style.setProperty('--vy', `${clickPositionRef.current.y * 100}%`);

    setIsTransitioning(true);

    // Use View Transitions API if available
    if ('startViewTransition' in document) {
      (document as any).startViewTransition(() => {
        setCurrentPage(page);
      }).finished.finally(() => {
        setIsTransitioning(false);
      });
    } else {
      // Fallback to Framer Motion
      setTimeout(() => {
        setCurrentPage(page);
        setTimeout(() => setIsTransitioning(false), 500);
      }, 300);
    }
  }, [currentPage, isTransitioning]);

  return (
    <PageTransitionContext.Provider value={{ transitionTo, currentPage, isTransitioning }}>
      {children}
    </PageTransitionContext.Provider>
  );
};

/**
 * Page wrapper with transition effects
 */
interface PageProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  transitionType?: 'fade' | 'slide' | 'scale' | 'rotate' | 'morph' | 'curl';
}

export const Page: React.FC<PageProps> = ({
  id,
  children,
  className = '',
  transitionType = 'morph',
}) => {
  const { currentPage } = usePageTransition();

  if (currentPage !== id) return null;

  const variants = {
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
    slide: {
      initial: { x: '100%', opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: '-100%', opacity: 0 },
    },
    scale: {
      initial: { scale: 0.8, opacity: 0 },
      animate: { scale: 1, opacity: 1 },
      exit: { scale: 1.2, opacity: 0 },
    },
    rotate: {
      initial: { rotateY: 90, opacity: 0 },
      animate: { rotateY: 0, opacity: 1 },
      exit: { rotateY: -90, opacity: 0 },
    },
    morph: {
      initial: { clipPath: 'circle(0% at var(--vx, 50%) var(--vy, 50%))', opacity: 0 },
      animate: { clipPath: 'circle(150% at var(--vx, 50%) var(--vy, 50%))', opacity: 1 },
      exit: { clipPath: 'circle(0% at var(--vx, 50%) var(--vy, 50%))', opacity: 0 },
    },
    curl: {
      initial: {
        rotateX: -90,
        transformOrigin: 'top',
        opacity: 0,
      },
      animate: {
        rotateX: 0,
        opacity: 1,
      },
      exit: {
        rotateX: 90,
        transformOrigin: 'bottom',
        opacity: 0,
      },
    },
  };

  const selectedVariant = variants[transitionType];

  return (
    <motion.div
      key={id}
      initial={selectedVariant.initial}
      animate={selectedVariant.animate}
      exit={selectedVariant.exit}
      transition={{
        duration: 0.75,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
      style={{ transformPerspective: 1200 }}
    >
      {children}
    </motion.div>
  );
};

/**
 * Navigation link with transition trigger
 */
interface TransitionLinkProps {
  to: string;
  children: React.ReactNode;
  className?: string;
}

export const TransitionLink: React.FC<TransitionLinkProps> = ({
  to,
  children,
  className = '',
}) => {
  const { transitionTo } = usePageTransition();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    transitionTo(to, e.clientX, e.clientY);
  };

  return (
    <a href={`#${to}`} onClick={handleClick} className={className}>
      {children}
    </a>
  );
};
