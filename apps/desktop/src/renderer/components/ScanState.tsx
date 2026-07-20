import { m } from 'motion/react';
import type { ReactNode } from 'react';
import { fadeUp, motionDurations, transition, useReducedMotion } from '../lib/motion';

export function ScanState({
  title,
  description,
}: {
  title: string;
  description: string;
}): React.JSX.Element {
  const reduced = useReducedMotion();

  return (
    <m.div
      className="scan-state"
      role="status"
      aria-live="polite"
      initial={reduced ? false : fadeUp.initial}
      animate={fadeUp.animate}
      transition={transition(motionDurations.panel, reduced)}
    >
      <span className="scan-progress" aria-hidden="true" />
      <strong>{title}</strong>
      <p>{description}</p>
    </m.div>
  );
}

export function ResultsRefreshBar({ active }: { active: boolean }): React.JSX.Element | null {
  if (!active) return null;
  return (
    <div
      className="results-refresh"
      role="status"
      aria-live="polite"
      aria-label="Refreshing results"
    >
      <span className="results-refresh-bar" />
    </div>
  );
}

export function StateCrossfade({
  stateKey,
  children,
}: {
  stateKey: string;
  children: ReactNode;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  return (
    <m.div
      key={stateKey}
      className="state-crossfade"
      initial={reduced ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition(motionDurations.panel, reduced)}
    >
      {children}
    </m.div>
  );
}
