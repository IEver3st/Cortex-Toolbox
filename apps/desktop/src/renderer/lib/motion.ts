import { useEffect, useState } from 'react';
import type { Transition } from 'motion/react';

/** App motion scale — no bounce or spring overshoot. */
export const motionDurations = {
  direct: 0.11,
  fast: 0.14,
  panel: 0.19,
  workspace: 0.22,
} as const;

export const easeOut = [0.22, 1, 0.36, 1] as const;

export function prefersReducedMotion(): boolean {
  if (
    typeof document !== 'undefined' &&
    document.documentElement.dataset.reducedMotion === 'true'
  ) {
    return true;
  }
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(prefersReducedMotion());
    sync();
    media.addEventListener('change', sync);

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-reduced-motion'],
    });

    return () => {
      media.removeEventListener('change', sync);
      observer.disconnect();
    };
  }, []);

  return reduced;
}

export function transition(duration: number = motionDurations.fast, reduced?: boolean): Transition {
  if (reduced ?? prefersReducedMotion()) {
    return { duration: 0 };
  }
  return { duration, ease: easeOut };
}

export const fadeUp = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
} as const;

export const drawerSlide = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 12 },
} as const;

export const overlayFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
} as const;

export const dialogPop = {
  initial: { opacity: 0, scale: 0.98, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.99, y: -4 },
} as const;

/** Compositor-only props for state-driven surfaces (lists, tabs, panels). */
export function stateMotion(
  reduced: boolean,
  duration: number = motionDurations.fast,
): {
  initial: false | { opacity: number; y: number };
  animate: { opacity: number; y: number };
  exit: { opacity: number; y: number };
  transition: Transition;
} {
  return {
    initial: reduced ? false : { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 },
    transition: transition(duration, reduced),
  };
}

/** Subtle press/hover feedback — transform only. */
export function iconInteraction(reduced: boolean) {
  if (reduced) return {};
  return {
    whileHover: { scale: 1.04 },
    whileTap: { scale: 0.97 },
    transition: transition(motionDurations.direct, reduced),
  } as const;
}
