import React, { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform, PanInfo } from 'framer-motion';

interface PhysicsCardProps {
  children: React.ReactNode;
  onTap?: () => void;
  className?: string;
  index?: number;
}

export const PhysicsCard: React.FC<PhysicsCardProps> = ({
  children,
  onTap,
  className = '',
  index = 0,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Motion values for position
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Spring physics configuration
  const springConfig = { damping: 25, stiffness: 300, mass: 1 };
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  // 3D transformations based on position
  const rotateX = useTransform(springY, [-100, 100], [15, -15]);
  const rotateY = useTransform(springX, [-100, 100], [-15, 15]);
  const scale = useTransform(springX, [-100, 0, 100], [0.95, 1, 0.95]);

  // Magnetic repulsion from nearby cards
  useEffect(() => {
    if (!cardRef.current || isDragging) return;

    const checkNearbyCards = () => {
      const currentRect = cardRef.current?.getBoundingClientRect();
      if (!currentRect) return;

      const allCards = document.querySelectorAll('[data-physics-card]');
      let repulsionX = 0;
      let repulsionY = 0;

      allCards.forEach((otherCard) => {
        if (otherCard === cardRef.current) return;

        const otherRect = otherCard.getBoundingClientRect();
        const dx = currentRect.left + currentRect.width / 2 - (otherRect.left + otherRect.width / 2);
        const dy = currentRect.top + currentRect.height / 2 - (otherRect.top + otherRect.height / 2);
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Repulsion threshold
        const threshold = 250;
        if (distance < threshold) {
          const force = (threshold - distance) / threshold;
          repulsionX += (dx / distance) * force * 20;
          repulsionY += (dy / distance) * force * 20;
        }
      });

      x.set(repulsionX);
      y.set(repulsionY);
    };

    const interval = setInterval(checkNearbyCards, 100);
    return () => clearInterval(interval);
  }, [isDragging, x, y]);

  const handleDragEnd = (event: any, info: PanInfo) => {
    setIsDragging(false);

    // Apply throw physics
    const velocity = Math.sqrt(info.velocity.x ** 2 + info.velocity.y ** 2);

    if (velocity > 500) {
      // If thrown hard enough, animate to final position
      const finalX = info.offset.x + info.velocity.x * 0.3;
      const finalY = info.offset.y + info.velocity.y * 0.3;

      x.set(finalX);
      y.set(finalY);

      // Spring back after a delay
      setTimeout(() => {
        x.set(0);
        y.set(0);
      }, 600);
    } else {
      // Spring back immediately
      x.set(0);
      y.set(0);
    }
  };

  return (
    <motion.div
      ref={cardRef}
      data-physics-card
      className={`cursor-grab active:cursor-grabbing ${className}`}
      style={{
        x: springX,
        y: springY,
        rotateX,
        rotateY,
        scale,
      }}
      drag
      dragElastic={0.1}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      onTap={onTap}
      whileHover={{
        scale: 1.05,
        boxShadow: '0 20px 40px -15px rgba(15, 139, 122, 0.3)',
        transition: { duration: 0.3, ease: 'easeOut' },
      }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.05,
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
};
