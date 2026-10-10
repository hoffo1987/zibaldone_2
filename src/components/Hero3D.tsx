import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { ParticleField } from './ParticleField';
import { LiquidGlassSphere } from './LiquidGlassSphere';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface Hero3DProps {
  children?: React.ReactNode;
}

export const Hero3D: React.FC<Hero3DProps> = ({ children }) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* WebGL Canvas */}
      <div className="absolute inset-0 z-0">
        {!prefersReducedMotion && (
          <Canvas
            dpr={[1, 2]}
            performance={{ min: 0.5 }}
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: 'high-performance',
            }}
          >
            <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />

            {/* Lighting */}
            <ambientLight intensity={0.4} />
            <pointLight position={[10, 10, 10]} intensity={0.8} color="#17C3AE" />
            <pointLight position={[-10, -10, -10]} intensity={0.6} color="#FBBF24" />
            <spotLight
              position={[0, 5, 0]}
              angle={0.5}
              penumbra={1}
              intensity={0.5}
              color="#FFFFFF"
            />

            <Suspense fallback={null}>
              {/* Particle System */}
              <ParticleField count={1500} attractRadius={0.4} attractStrength={0.015} />

              {/* Central Glass Sphere */}
              <LiquidGlassSphere />
            </Suspense>

            {/* Optional orbit controls for debugging - remove in production */}
            {/* <OrbitControls enableZoom={false} enablePan={false} /> */}
          </Canvas>
        )}

        {/* Fallback gradient for reduced motion */}
        {prefersReducedMotion && (
          <div className="absolute inset-0 bg-gradient-to-br from-[#17C3AE]/20 via-transparent to-[#FBBF24]/20" />
        )}
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-6">
        {children}
      </div>

      {/* Vignette Effect */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-radial from-transparent via-transparent to-black/40 z-5" />
    </div>
  );
};
