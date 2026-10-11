import React from 'react';
import { PhysicsCard } from './PhysicsCard';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface EnhancedCardProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  index?: number;
  enabled?: boolean;
}

/**
 * Enhanced Card Wrapper - aggiunge fisica alle card esistenti
 * Si può usare come drop-in replacement per le card normali
 */
export const EnhancedCard: React.FC<EnhancedCardProps> = ({
  children,
  onClick,
  className = '',
  index = 0,
  enabled = true,
}) => {
  const prefersReducedMotion = useReducedMotion();

  // Se ridotto movimento o disabilitato, renderizza card normale
  if (!enabled || prefersReducedMotion) {
    return (
      <div className={className} onClick={onClick}>
        {children}
      </div>
    );
  }

  // Altrimenti usa PhysicsCard
  return (
    <PhysicsCard
      onTap={onClick}
      className={className}
      index={index}
    >
      {children}
    </PhysicsCard>
  );
};

/**
 * Hook per convertire facilmente grid di card esistenti
 */
export const useEnhancedCards = (enabled: boolean = true) => {
  return {
    CardWrapper: (props: Omit<EnhancedCardProps, 'enabled'>) => (
      <EnhancedCard {...props} enabled={enabled} />
    ),
  };
};
