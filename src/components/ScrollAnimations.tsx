import React, { useRef } from 'react';
import { useGSAP } from '../hooks/useGSAP';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

interface ScrollSectionProps {
  children: React.ReactNode;
  className?: string;
  animationType?: 'fade' | 'slide' | 'scale' | 'rotate' | 'parallax' | 'reveal';
  triggerStart?: string;
  triggerEnd?: string;
  scrub?: boolean | number;
}

export const ScrollSection: React.FC<ScrollSectionProps> = ({
  children,
  className = '',
  animationType = 'fade',
  triggerStart = 'top 80%',
  triggerEnd = 'bottom 20%',
  scrub = 1,
}) => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!sectionRef.current) return;

    const element = sectionRef.current;

    // Animation configurations
    const animations: Record<string, gsap.TweenVars> = {
      fade: {
        opacity: 0,
        y: 60,
      },
      slide: {
        x: -100,
        opacity: 0,
      },
      scale: {
        scale: 0.8,
        opacity: 0,
      },
      rotate: {
        rotationY: 45,
        opacity: 0,
        transformPerspective: 1000,
      },
      parallax: {
        y: 100,
      },
      reveal: {
        clipPath: 'inset(0 100% 0 0)',
      },
    };

    const fromVars = animations[animationType] || animations.fade;

    // Create scroll-triggered animation
    gsap.from(element, {
      ...fromVars,
      duration: 1.2,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: element,
        start: triggerStart,
        end: triggerEnd,
        scrub: scrub,
        toggleActions: 'play none none reverse',
        markers: false, // Set to true for debugging
      },
    });
  }, [animationType, triggerStart, triggerEnd, scrub]);

  return (
    <div ref={sectionRef} className={className}>
      {children}
    </div>
  );
};

/**
 * Advanced parallax layer component
 */
interface ParallaxLayerProps {
  children: React.ReactNode;
  speed?: number;
  direction?: 'vertical' | 'horizontal';
  className?: string;
}

export const ParallaxLayer: React.FC<ParallaxLayerProps> = ({
  children,
  speed = 0.5,
  direction = 'vertical',
  className = '',
}) => {
  const layerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!layerRef.current) return;

    const element = layerRef.current;
    const movement = direction === 'vertical' ? 'y' : 'x';
    const distance = 200 * speed;

    gsap.to(element, {
      [movement]: -distance,
      ease: 'none',
      scrollTrigger: {
        trigger: element,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
    });
  }, [speed, direction]);

  return (
    <div ref={layerRef} className={className}>
      {children}
    </div>
  );
};

/**
 * Text reveal on scroll - word by word
 */
interface ScrollTextRevealProps {
  text: string;
  className?: string;
  stagger?: number;
}

export const ScrollTextReveal: React.FC<ScrollTextRevealProps> = ({
  text,
  className = '',
  stagger = 0.05,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!containerRef.current) return;

    const words = containerRef.current.querySelectorAll('.word');

    gsap.from(words, {
      opacity: 0,
      y: 50,
      rotationX: -90,
      transformOrigin: 'top center',
      stagger: stagger,
      duration: 0.8,
      ease: 'back.out(1.7)',
      scrollTrigger: {
        trigger: containerRef.current,
        start: 'top 75%',
        toggleActions: 'play none none reverse',
      },
    });
  }, [text, stagger]);

  const words = text.split(' ');

  return (
    <div ref={containerRef} className={className}>
      {words.map((word, index) => (
        <span key={index} className="word inline-block mr-2">
          {word}
        </span>
      ))}
    </div>
  );
};

/**
 * Pin section - stays fixed while scrolling
 */
interface PinSectionProps {
  children: React.ReactNode;
  pinSpacing?: boolean;
  className?: string;
}

export const PinSection: React.FC<PinSectionProps> = ({
  children,
  pinSpacing = true,
  className = '',
}) => {
  const pinRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!pinRef.current) return;

    ScrollTrigger.create({
      trigger: pinRef.current,
      start: 'top top',
      end: '+=100%',
      pin: true,
      pinSpacing: pinSpacing,
    });
  }, [pinSpacing]);

  return (
    <div ref={pinRef} className={className}>
      {children}
    </div>
  );
};
