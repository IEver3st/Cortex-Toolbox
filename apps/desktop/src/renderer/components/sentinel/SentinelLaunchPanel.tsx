import type { ReactNode } from 'react';

export function SentinelLaunchPanel({
  scopeName,
  lastValidationLabel,
  runAction,
}: {
  scopeName: string;
  lastValidationLabel: string | null;
  runAction: ReactNode;
}): React.JSX.Element {
  return (
    <section className="sentinel-launch" aria-labelledby="sentinel-launch-title">
      <div className="sentinel-launch-primary">
        <p className="sentinel-eyebrow">Release readiness</p>
        <h2 id="sentinel-launch-title">Validate {scopeName}</h2>
        <p className="sentinel-launch-lead">
          Run a deterministic static inspection of the manifest, declared paths, package contents,
          and sampled sensitive material.
        </p>
        <div className="sentinel-launch-action">{runAction}</div>
        <p className="sentinel-last-run">
          Last validation: <span>{lastValidationLabel ?? 'Not run yet'}</span>
        </p>
        <p className="sentinel-disclaimer">Sentinel does not execute project scripts.</p>
      </div>
    </section>
  );
}
