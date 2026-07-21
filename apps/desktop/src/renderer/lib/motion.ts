import { useEffect, useState } from 'react';
import type { Transition, Variants } from 'motion/react';

export const motionDurations = {
  direct: 0.09,
  fast: 0.12,
  panel: 0.15,
  workspace: 0.18,
} as const;

export const easeOut = [0.16, 1, 0.3, 1] as const;
export const easeIn = [0.55, 0, 1, 0.45] as const;

export type FolderNavDirection = 'enter' | 'exit' | 'switch' | 'back';

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
    return { duration: 0.07, ease: easeOut };
  }
  return { duration, ease: easeOut };
}

export const fadeUp = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 2 },
} as const;

export const drawerSlide = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 6 },
} as const;

export const overlayFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
} as const;

export const dialogPop = {
  initial: { opacity: 0, scale: 0.985, y: -3 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.992, y: -2 },
} as const;

type CompositorMotion = {
  initial: false | { opacity: number; transform: string };
  animate: { opacity: number; transform: string; transition?: Transition };
  exit: { opacity: number; transform: string; transition?: Transition };
};

function fadeMotion(reduced: boolean, duration: number): CompositorMotion {
  if (reduced) {
    return {
      initial: false,
      animate: { opacity: 1, transform: 'none' },
      exit: { opacity: 1, transform: 'none' },
    };
  }

  const exitDuration = Math.max(motionDurations.direct, duration * 0.65);
  return {
    initial: { opacity: 0, transform: 'none' },
    animate: { opacity: 1, transform: 'none', transition: { duration, ease: easeOut } },
    exit: { opacity: 0, transform: 'none', transition: { duration: exitDuration, ease: easeOut } },
  };
}

function compositorMotion(
  reduced: boolean,
  duration: number,
  enter: string,
  exit: string,
  exitScale = 0.68,
): CompositorMotion {
  if (reduced) {
    const fadeIn: Transition = { duration: 0.08, ease: easeOut };
    const fadeOut: Transition = { duration: 0.06, ease: easeIn };
    return {
      initial: false,
      animate: { opacity: 1, transform: 'translate3d(0, 0, 0)', transition: fadeIn },
      exit: { opacity: 0, transform: 'translate3d(0, 0, 0)', transition: fadeOut },
    };
  }

  const enterTransition: Transition = { duration, ease: easeOut };
  const exitTransition: Transition = {
    duration: Math.max(motionDurations.direct, duration * exitScale),
    ease: easeIn,
  };

  return {
    initial: { opacity: 0, transform: enter },
    animate: { opacity: 1, transform: 'translate3d(0, 0, 0)', transition: enterTransition },
    exit: { opacity: 0, transform: exit, transition: exitTransition },
  };
}

export function stateMotion(
  reduced: boolean,
  duration: number = motionDurations.fast,
): CompositorMotion {
  return compositorMotion(reduced, duration, 'translate3d(0, 4px, 0)', 'translate3d(0, 2px, 0)');
}

export function folderPageMotion(
  reduced: boolean,
  duration: number = motionDurations.workspace,
): CompositorMotion {
  return compositorMotion(reduced, duration, 'translate3d(0, 4px, 0)', 'translate3d(0, -2px, 0)');
}

export function folderPageVariants(
  reduced: boolean,
  duration: number = motionDurations.workspace,
): Variants {
  if (reduced) {
    return {
      initial: { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      animate: { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      exit: { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    };
  }

  const exitDuration = Math.max(motionDurations.direct, duration * 0.68);
  const exitTransition = { duration: exitDuration, ease: easeIn };
  const enterTransition = { duration, ease: easeOut };

  return {
    initial: (direction: FolderNavDirection) => ({
      opacity: 0,
      transform:
        direction === 'switch'
          ? 'translate3d(4px, 0, 0)'
          : direction === 'back'
            ? 'translate3d(-4px, 0, 0)'
            : direction === 'exit'
              ? 'translate3d(0, 3px, 0)'
              : 'translate3d(0, 4px, 0)',
    }),
    animate: {
      opacity: 1,
      transform: 'translate3d(0, 0, 0)',
      transition: enterTransition,
    },
    exit: (direction: FolderNavDirection) => ({
      opacity: 0,
      transform:
        direction === 'switch'
          ? 'translate3d(-3px, 0, 0)'
          : direction === 'back'
            ? 'translate3d(3px, 0, 0)'
            : direction === 'enter'
              ? 'translate3d(0, -2px, 0)'
              : 'translate3d(0, 3px, 0)',
      transition: exitTransition,
    }),
  };
}

export function folderDrillMotion(
  reduced: boolean,
  direction: 'forward' | 'back',
  duration: number = motionDurations.panel,
): CompositorMotion {
  if (direction === 'forward') {
    return compositorMotion(reduced, duration, 'translate3d(4px, 0, 0)', 'translate3d(-3px, 0, 0)');
  }
  return compositorMotion(reduced, duration, 'translate3d(-4px, 0, 0)', 'translate3d(3px, 0, 0)');
}

export function folderNavMotion(
  reduced: boolean,
  direction: FolderNavDirection,
  duration: number = motionDurations.workspace,
): CompositorMotion {
  switch (direction) {
    case 'enter':
      return compositorMotion(
        reduced,
        duration,
        'translate3d(0, 5px, 0)',
        'translate3d(0, -3px, 0)',
      );
    case 'exit':
      return compositorMotion(
        reduced,
        duration,
        'translate3d(0, -3px, 0)',
        'translate3d(0, 5px, 0)',
        0.68,
      );
    case 'switch':
      return folderDrillMotion(reduced, 'forward', motionDurations.panel);
    case 'back':
      return folderDrillMotion(reduced, 'back', motionDurations.panel);
    default:
      return folderPageMotion(reduced, duration);
  }
}

export function workspaceTabMotion(
  reduced: boolean,
  duration: number = motionDurations.workspace,
): CompositorMotion {
  return compositorMotion(reduced, duration, 'translate3d(5px, 0, 0)', 'translate3d(-4px, 0, 0)');
}

export function settingsPageMotion(
  reduced: boolean,
  duration: number = motionDurations.panel,
): CompositorMotion {
  return compositorMotion(reduced, duration, 'translate3d(0, 3px, 0)', 'translate3d(0, -2px, 0)');
}

export function panelRevealMotion(
  reduced: boolean,
  duration: number = motionDurations.fast,
): CompositorMotion {
  return compositorMotion(reduced, duration, 'translate3d(0, 4px, 0)', 'translate3d(0, -2px, 0)');
}

export function collapsiblePanelMotion(
  reduced: boolean,
  duration: number = motionDurations.fast,
): CompositorMotion {
  return compositorMotion(
    reduced,
    duration,
    'translate3d(0, 3px, 0)',
    'translate3d(0, 1px, 0)',
    0.65,
  );
}

export function inlineViewMotion(
  reduced: boolean,
  direction: 'forward' | 'back' = 'forward',
  duration: number = motionDurations.fast,
): CompositorMotion {
  return folderDrillMotion(reduced, direction, duration);
}

export function iconInteraction(reduced: boolean) {
  if (reduced) return {};
  return {
    whileTap: { scale: 0.97 },
    transition: transition(motionDurations.direct, reduced),
  } as const;
}
