import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useMousePosition } from '../hooks/useMousePosition';
import * as THREE from 'three';

interface ParticleFieldProps {
  count?: number;
  attractRadius?: number;
  attractStrength?: number;
}

export const ParticleField: React.FC<ParticleFieldProps> = ({
  count = 2000,
  attractRadius = 0.3,
  attractStrength = 0.02,
}) => {
  const mesh = useRef<THREE.Points>(null);
  const mouse = useMousePosition(16);
  const { viewport } = useThree();

  // Generate initial particle positions and velocities
  const [positions, velocities] = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Random positions in a sphere
      const radius = Math.random() * 2 + 1;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);

      // Initial velocities
      velocities[i3] = (Math.random() - 0.5) * 0.01;
      velocities[i3 + 1] = (Math.random() - 0.5) * 0.01;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.01;
    }

    return [positions, velocities];
  }, [count]);

  // Physics simulation
  useFrame((state) => {
    if (!mesh.current) return;

    const positions = mesh.current.geometry.attributes.position.array as Float32Array;
    const time = state.clock.getElapsedTime();

    // Convert mouse position to 3D space
    const mouseX = (mouse.normalizedX * viewport.width) / 2;
    const mouseY = -(mouse.normalizedY * viewport.height) / 2;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Current position
      let x = positions[i3];
      let y = positions[i3 + 1];
      let z = positions[i3 + 2];

      // Distance to mouse
      const dx = mouseX - x;
      const dy = mouseY - y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Apply attraction/repulsion force
      if (distance < attractRadius) {
        const force = (attractRadius - distance) * attractStrength;
        velocities[i3] += (dx / distance) * force;
        velocities[i3 + 1] += (dy / distance) * force;
      }

      // Apply damping
      velocities[i3] *= 0.98;
      velocities[i3 + 1] *= 0.98;
      velocities[i3 + 2] *= 0.98;

      // Update position
      x += velocities[i3];
      y += velocities[i3 + 1];
      z += velocities[i3 + 2];

      // Orbital motion
      const orbit = Math.sin(time * 0.1 + i * 0.01) * 0.002;
      x += Math.cos(time * 0.2 + i) * orbit;
      y += Math.sin(time * 0.2 + i) * orbit;

      // Boundaries - soft bounce
      const maxDist = 3;
      const dist = Math.sqrt(x * x + y * y + z * z);
      if (dist > maxDist) {
        const factor = 0.95;
        x *= factor;
        y *= factor;
        z *= factor;
        velocities[i3] *= -0.5;
        velocities[i3 + 1] *= -0.5;
        velocities[i3 + 2] *= -0.5;
      }

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;
    }

    mesh.current.geometry.attributes.position.needsUpdate = true;

    // Rotate entire system slowly
    mesh.current.rotation.y = time * 0.05;
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.015}
        color="#17C3AE"
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};
