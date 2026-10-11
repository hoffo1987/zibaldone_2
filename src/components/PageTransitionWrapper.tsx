import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface PageTransitionWrapperProps {
  children: React.ReactNode;
  pageKey: string; // Chiave univoca per la pagina (es. "home", "write", "my_pages")
  transitionType?: 'fade' | 'slide' | 'scale' | 'blur';
}

/**
 * Page Transition Wrapper - aggiunge transizioni cinematiche tra le pagine
 * Si integra con la navigazione esistente dell'app
 */
export const PageTransitionWrapper: React.FC<PageTransitionWrapperProps> = ({
  children,
  pageKey,
  transitionType = 'fade',
}) => {
  const prefersReducedMotion = useReducedMotion();

  const variants = {
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
    slide: {
      initial: { x: 20, opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: -20, opacity: 0 },
    },
    scale: {
      initial: { scale: 0.96, opacity: 0 },
      animate: { scale: 1, opacity: 1 },
      exit: { scale: 1.04, opacity: 0 },
    },
    blur: {
      initial: { filter: 'blur(10px)', opacity: 0 },
      animate: { filter: 'blur(0px)', opacity: 1 },
      exit: { filter: 'blur(10px)', opacity: 0 },
    },
  };

  if (prefersReducedMotion) {
    return <div key={pageKey}>{children}</div>;
  }

  const selectedVariant = variants[transitionType];

  return (
    <motion.div
      key={pageKey}
      initial={selectedVariant.initial}
      animate={selectedVariant.animate}
      transition={{
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
};

/**
 * Hook per gestire transizioni tra tab/sezioni
 */
export const usePageTransitions = (currentTab: string) => {
  useEffect(() => {
    // Scroll to top on page change
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentTab]);

  return {
    PageWrapper: ({ children }: { children: React.ReactNode }) => (
      <PageTransitionWrapper pageKey={currentTab} transitionType="fade">
        {children}
      </PageTransitionWrapper>
    ),
  };
};
