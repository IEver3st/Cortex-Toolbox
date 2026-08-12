import { CheckCircle2, Circle, LoaderCircle, XCircle } from 'lucide-react';
import { m } from 'motion/react';
import { fadeUp, motionDurations, transition, useReducedMotion } from '../lib/motion';

export type StageStatus = 'waiting' | 'running' | 'completed' | 'failed';

export interface ValidationStage {
  id: string;
  label: string;
  status: StageStatus;
}

function StageIcon({ status }: { status: StageStatus }): React.JSX.Element {
  if (status === 'completed') return <CheckCircle2 aria-hidden="true" />;
  if (status === 'failed') return <XCircle aria-hidden="true" />;
  if (status === 'running') return <LoaderCircle aria-hidden="true" className="spin" />;
  return <Circle aria-hidden="true" />;
}

export function ValidationStages({
  stages,
  onCancel,
  cancellable = false,
}: {
  stages: ValidationStage[];
  onCancel?: () => void;
  cancellable?: boolean;
}): React.JSX.Element {
  const reduced = useReducedMotion();

  return (
    <m.section
      className="sentinel-stages"
      role="status"
      aria-live="polite"
      aria-label="Validation progress"
      initial={reduced ? false : fadeUp.initial}
      animate={fadeUp.animate}
      transition={transition(motionDurations.panel, reduced)}
    >
      <header className="sentinel-stages-head">
        <div>
          <h2>Validation in progress</h2>
          <p>Static checks only — resource scripts are not executed.</p>
        </div>
        {cancellable && onCancel ? (
          <button type="button" className="text-button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </header>
      <ol className="sentinel-stage-list">
        {stages.map((stage) => (
          <li
            key={stage.id}
            className={`sentinel-stage is-${stage.status}`}
            aria-current={stage.status === 'running' ? 'step' : undefined}
          >
            <span className="sentinel-stage-icon">
              <StageIcon status={stage.status} />
            </span>
            <span className="sentinel-stage-label">{stage.label}</span>
            <span className="sentinel-stage-state">
              {stage.status === 'waiting'
                ? 'Waiting'
                : stage.status === 'running'
                  ? 'Running'
                  : stage.status === 'completed'
                    ? 'Done'
                    : 'Failed'}
            </span>
          </li>
        ))}
      </ol>
    </m.section>
  );
}
