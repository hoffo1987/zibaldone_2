import React, { useRef, useEffect } from 'react';
import { useMousePosition } from '../hooks/useMousePosition';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface ParticleTrailProps {
  enabled?: boolean;
  maxParticles?: number;
  particleLife?: number;
  colors?: string[];
}

export const ParticleTrail: React.FC<ParticleTrailProps> = ({
  enabled = true,
  maxParticles = 50,
  particleLife = 1000,
  colors = ['#17C3AE', '#FBBF24', '#6366F1'],
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouse = useMousePosition(16);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Create new particle
    const createParticle = (x: number, y: number, velocity: number) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * velocity + 0.5;

      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: particleLife,
        maxLife: particleLife,
        size: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });

      // Remove oldest particles if over limit
      if (particlesRef.current.length > maxParticles) {
        particlesRef.current.shift();
      }
    };

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Calculate mouse velocity
      const dx = mouse.x - lastPosRef.current.x;
      const dy = mouse.y - lastPosRef.current.y;
      const velocity = Math.sqrt(dx * dx + dy * dy);

      // Create particles based on velocity
      if (velocity > 2) {
        const numParticles = Math.min(Math.floor(velocity / 10), 3);
        for (let i = 0; i < numParticles; i++) {
          createParticle(mouse.x, mouse.y, velocity);
        }
      }

      lastPosRef.current = { x: mouse.x, y: mouse.y };

      // Update and draw particles
      particlesRef.current = particlesRef.current.filter((particle) => {
        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Apply physics
        particle.vy += 0.1; // Gravity
        particle.vx *= 0.98; // Air resistance
        particle.vy *= 0.98;

        // Update life
        particle.life -= 16;

        if (particle.life <= 0) return false;

        // Draw particle
        const alpha = particle.life / particle.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;

        // Create gradient for particle
        const gradient = ctx.createRadialGradient(
          particle.x,
          particle.y,
          0,
          particle.x,
          particle.y,
          particle.size
        );
        gradient.addColorStop(0, particle.color);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        return true;
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, mouse.x, mouse.y, maxParticles, particleLife, colors]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      style={{ mixBlendMode: 'screen' }}
    />
  );
};
