import type { ProbeFinding, ProbeHotspot } from '@cortex/script-analysis';
import { CheckCircle2, Copy, ExternalLink, EyeOff, FolderOpen, Info, Network } from 'lucide-react';
import type { ProbeRunRecord } from '../../lib/probe-history';
import { summarizeComparison } from '../../lib/probe-history';
import { CATEGORY_LABEL, CONFIDENCE_LABEL, SEVERITY_META } from './constants';
import { formatDateTime, locationLabel } from './utils';

export function ProbeFindingInspector({
  finding,
  excerpt,
  reviewed,
  suppressed,
  suppressDraft,
  suppressReason,
  counts,
  hotspots,
  previousRun,
  currentFindings,
  onSuppressDraft,
  onSuppress,
  onMarkReviewed,
  onOpenEditor,
  onOpenWire,
  onReveal,
  onCopyFinding,
  onOpenFullFile,
}: {
  finding: ProbeFinding | null;
  excerpt: string | null;
  reviewed: boolean;
  suppressed: boolean;
  suppressDraft: string;
  suppressReason: string | null;
  counts: { high: number; medium: number; low: number; info: number };
  hotspots: ProbeHotspot[];
  previousRun: ProbeRunRecord | null;
  currentFindings: ProbeFinding[];
  onSuppressDraft: (value: string) => void;
  onSuppress: () => void;
  onMarkReviewed: () => void;
  onOpenEditor: (finding: ProbeFinding) => void;
  onOpenWire: (finding: ProbeFinding) => void;
  onReveal: (finding: ProbeFinding) => void;
  onCopyFinding: (finding: ProbeFinding) => void;
  onOpenFullFile: (finding: ProbeFinding) => void;
}): React.JSX.Element {
  if (!finding) {
    const comparison = summarizeComparison(currentFindings, previousRun);
    return (
      <aside className="probe-detail-panel probe-detail-empty" aria-label="Finding details">
        <Info aria-hidden="true" />
        <h2>Scan context</h2>
        <p>Select a finding to inspect evidence, impact, and repair direction.</p>
        <dl className="probe-detail-summary-stats">
          <div>
            <dt>High</dt>
            <dd>{counts.high}</dd>
          </div>
          <div>
            <dt>Medium</dt>
            <dd>{counts.medium}</dd>
          </div>
          <div>
            <dt>Low</dt>
            <dd>{counts.low}</dd>
          </div>
          <div>
            <dt>Info</dt>
            <dd>{counts.info}</dd>
          </div>
        </dl>

        {previousRun ? (
          <section className="probe-detail-compare">
            <h3>Compared to previous scan</h3>
            <p>
              Resolved {comparison.resolvedCount} · New {comparison.newCount} · Unchanged{' '}
              {comparison.unchangedCount}
            </p>
            <dl>
              <div>
                <dt>Previous</dt>
                <dd>
                  {previousRun.highCount} high · {previousRun.mediumCount} medium ·{' '}
                  {previousRun.lowCount} low
                </dd>
              </div>
              <div>
                <dt>Scanned</dt>
                <dd>{formatDateTime(previousRun.at)}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        {hotspots.length > 0 ? (
          <section className="probe-detail-hotspots">
            <h3>Review hotspots</h3>
            <ol>
              {hotspots.slice(0, 5).map((hotspot) => (
                <li key={hotspot.file}>
                  <span className="mono">{hotspot.file}</span>
                  <span>
                    {hotspot.high} high · {hotspot.medium} medium · score {hotspot.score}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </aside>
    );
  }

  const severityMeta = SEVERITY_META[finding.severity];

  return (
    <aside className="probe-detail-panel" aria-label="Finding details">
      <header>
        <div>
          <span className={`badge ${severityMeta.badge}`}>{severityMeta.short}</span>
          <h2>{finding.title}</h2>
        </div>
      </header>

      <dl className="probe-detail-meta">
        <div>
          <dt>Rule</dt>
          <dd>
            <code>{finding.ruleId}</code>
          </dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd className="mono">{locationLabel(finding)}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{CATEGORY_LABEL[finding.category]}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{CONFIDENCE_LABEL[finding.confidence]}</dd>
        </div>
      </dl>

      <section>
        <h3>Why Cortex flagged it</h3>
        <p>{finding.explanation}</p>
      </section>

      <section>
        <h3>Likely impact</h3>
        <p>
          {finding.inferred ? 'This may ' : 'Cortex found '}
          {finding.impact.charAt(0).toLowerCase()}
          {finding.impact.slice(1)}
        </p>
      </section>

      {finding.evidence.length > 0 && (
        <section>
          <h3>Evidence</h3>
          <ul className="probe-evidence-list">
            {finding.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Suggested repair</h3>
        <p>{finding.remediation}</p>
      </section>

      {excerpt ? (
        <section>
          <div className="probe-excerpt-head">
            <h3>Source excerpt</h3>
            <button type="button" className="text-button" onClick={() => onOpenFullFile(finding)}>
              Open full file
            </button>
          </div>
          <pre className="probe-excerpt mono">{excerpt}</pre>
        </section>
      ) : null}

      <div className="probe-detail-actions">
        <button type="button" onClick={() => onOpenEditor(finding)}>
          <ExternalLink aria-hidden="true" />
          Open in editor
        </button>
        {finding.wireLink ? (
          <button type="button" onClick={() => onOpenWire(finding)}>
            <Network aria-hidden="true" />
            Open in Wire
          </button>
        ) : null}
        <button type="button" onClick={() => onReveal(finding)}>
          <FolderOpen aria-hidden="true" />
          Reveal in Explorer
        </button>
        <button type="button" onClick={() => onCopyFinding(finding)}>
          <Copy aria-hidden="true" />
          Copy finding
        </button>
        {!reviewed && !suppressed ? (
          <button type="button" onClick={onMarkReviewed}>
            <CheckCircle2 aria-hidden="true" />
            Mark reviewed
          </button>
        ) : null}
      </div>

      {!suppressed ? (
        <form
          className="probe-suppress"
          onSubmit={(event) => {
            event.preventDefault();
            onSuppress();
          }}
        >
          <label htmlFor="probe-suppress-reason">Suppress with reason</label>
          <textarea
            id="probe-suppress-reason"
            value={suppressDraft}
            onChange={(event) => onSuppressDraft(event.target.value)}
            rows={2}
            placeholder="Why suppress this finding?"
            required
          />
          <button type="submit" className="text-button">
            <EyeOff aria-hidden="true" />
            Suppress finding
          </button>
        </form>
      ) : (
        <p className="probe-suppressed-note">
          Suppressed{suppressReason ? `: ${suppressReason}` : ''}
        </p>
      )}

      <p className="probe-static-note">
        Static analysis only. Findings describe code shape and references — not measured runtime
        cost.
      </p>
    </aside>
  );
}
