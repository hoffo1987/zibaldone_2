import React from 'react';
import { motion } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { ParticleField } from './ParticleField';
import { LiquidGlassSphere } from './LiquidGlassSphere';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface HeroBackgroundProps {
  children: React.ReactNode;
  enabled?: boolean;
}

/**
 * Hero Background 3D - si sovrappone al pannello esistente
 * Wrapper che non tocca il contenuto ma aggiunge WebGL dietro
 */
export const HeroBackground: React.FC<HeroBackgroundProps> = ({
  children,
  enabled = true,
}) => {
  const prefersReducedMotion = useReducedMotion();

  if (!enabled || prefersReducedMotion) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Canvas WebGL sotto il contenuto */}
      <div className="absolute inset-0 overflow-hidden rounded-3xl opacity-40">
        <Canvas
          camera={{ position: [0, 0, 5], fov: 75 }}
          style={{ background: 'transparent' }}
        >
          {/* Luci */}
          <ambientLight intensity={0.3} />
          <pointLight position={[10, 10, 10]} intensity={0.8} color="#17C3AE" />
          <pointLight position={[-10, -10, 5]} intensity={0.5} color="#FBBF24" />
          <pointLight position={[0, 5, -5]} intensity={0.4} color="#6366F1" />

          {/* Campo di particelle interattivo */}
          <ParticleField count={1500} attractRadius={0.3} attractStrength={0.02} />

          {/* Sfera liquid glass centrale */}
          <LiquidGlassSphere />
        </Canvas>
      </div>

      {/* Contenuto originale sopra */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

/**
 * Hook per wrappare facilmente il pannello hero esistente
 */
export const useHeroBackground = () => {
  return { HeroBackground };
};
