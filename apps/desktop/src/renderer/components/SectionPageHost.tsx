import { AnimatePresence, m } from 'motion/react';
import type { ReactNode } from 'react';
import {
  folderNavMotion,
  folderPageMotion,
  inlineViewMotion,
  motionDurations,
  type FolderNavDirection,
  settingsPageMotion,
  stateMotion,
  useReducedMotion,
  workspaceTabMotion,
} from '../lib/motion';

export type SectionPageVariant = 'state' | 'folder' | 'settings' | 'workspace' | 'inline';

function resolveMotion(
  variant: SectionPageVariant,
  reduced: boolean,
  duration: number | undefined,
  direction: FolderNavDirection | undefined,
  inlineDirection: 'forward' | 'back',
) {
  switch (variant) {
    case 'folder':
      return direction
        ? folderNavMotion(reduced, direction, duration ?? motionDurations.workspace)
        : folderPageMotion(reduced, duration ?? motionDurations.workspace);
    case 'settings':
      return settingsPageMotion(reduced, duration ?? motionDurations.panel);
    case 'workspace':
      return workspaceTabMotion(reduced, duration ?? motionDurations.workspace);
    case 'inline':
      return inlineViewMotion(reduced, inlineDirection, duration ?? motionDurations.fast);
    default:
      return stateMotion(reduced, duration ?? motionDurations.fast);
  }
}

export function SectionPageHost({
  pageKey,
  children,
  className = 'section-page-host',
  variant = 'state',
  duration,
  direction,
  inlineDirection = 'forward',
}: {
  pageKey: string;
  children: ReactNode;
  className?: string;
  variant?: SectionPageVariant;
  duration?: number;
  direction?: FolderNavDirection;
  inlineDirection?: 'forward' | 'back';
}): React.JSX.Element {
  const reduced = useReducedMotion();
  const motion = resolveMotion(variant, reduced, duration, direction, inlineDirection);
  const overlayLayout = variant === 'folder' || variant === 'workspace' || variant === 'inline';

  return (
    <div className={`${className}-stack page-host-stack${overlayLayout ? ' is-overlay' : ''}`}>
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={pageKey}
          className={`${className}${overlayLayout ? ' is-overlay-pane' : ''}`}
          {...motion}
        >
          {children}
        </m.div>
      </AnimatePresence>
    </div>
  );
}
