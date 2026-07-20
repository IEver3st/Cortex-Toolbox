import { Copy, ExternalLink, EyeOff, FileCode2, FolderOpen, Info } from 'lucide-react';
import type { AuditFinding } from './constants';
import { locationLabel, ruleMeta } from './utils';

export function SentinelFindingInspector({
  finding,
  excerpt,
  suppressDraft,
  suppressReason,
  isHidden,
  counts,
  onSuppressDraft,
  onSuppress,
  onOpenFile,
  onReveal,
  onCopyPath,
  onGoIndex,
}: {
  finding: AuditFinding | null;
  excerpt: string | null;
  suppressDraft: string;
  suppressReason: string | null;
  isHidden: boolean;
  counts: { error: number; warning: number; info: number };
  onSuppressDraft: (value: string) => void;
  onSuppress: () => void;
  onOpenFile: (finding: AuditFinding) => void;
  onReveal: (finding: AuditFinding) => void;
  onCopyPath: (finding: AuditFinding) => void;
  onGoIndex: () => void;
}): React.JSX.Element {
  if (!finding) {
    return (
      <aside className="sentinel-detail-panel sentinel-detail-empty" aria-label="Finding details">
        <Info aria-hidden="true" />
        <h2>Select a finding</h2>
        <p>
          Review errors, warnings, and notes in the list. Details, suggested fixes, and file
          excerpts appear here.
        </p>
        <dl className="sentinel-detail-summary-stats">
          <div>
            <dt>Errors</dt>
            <dd>{counts.error}</dd>
          </div>
          <div>
            <dt>Warnings</dt>
            <dd>{counts.warning}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{counts.info}</dd>
          </div>
        </dl>
      </aside>
    );
  }

  const meta = ruleMeta(finding.ruleId);

  return (
    <aside className="sentinel-detail-panel" aria-label="Finding details">
      <header>
        <div>
          <span className={`sentinel-severity-label severity-${finding.severity}`}>
            {finding.severity === 'error'
              ? 'Error'
              : finding.severity === 'warning'
                ? 'Warning'
                : 'Note'}
          </span>
          <h2>{meta.title}</h2>
        </div>
      </header>
      <dl className="sentinel-detail-meta">
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
          <dd>{meta.category}</dd>
        </div>
      </dl>
      <section>
        <h3>Explanation</h3>
        <p>{finding.explanation}</p>
      </section>
      <section>
        <h3>Why it matters</h3>
        <p>{meta.impact}</p>
      </section>
      <section>
        <h3>Suggested fix</h3>
        <p>{finding.remediation}</p>
      </section>
      {excerpt && (
        <section>
          <h3>Excerpt</h3>
          <pre className="sentinel-excerpt mono">{excerpt}</pre>
        </section>
      )}
      <div className="sentinel-detail-actions">
        {finding.ruleId.startsWith('manifest/') ? (
          <button type="button" onClick={onGoIndex}>
            <FileCode2 aria-hidden="true" />
            Open file
          </button>
        ) : finding.file !== '.' ? (
          <button type="button" onClick={() => onOpenFile(finding)}>
            <ExternalLink aria-hidden="true" />
            Open file
          </button>
        ) : null}
        <button type="button" onClick={() => onReveal(finding)}>
          <FolderOpen aria-hidden="true" />
          Reveal
        </button>
        <button type="button" onClick={() => onCopyPath(finding)}>
          <Copy aria-hidden="true" />
          Copy path
        </button>
      </div>
      {!isHidden && !finding.suppressed && (
        <form
          className="sentinel-suppress"
          onSubmit={(event) => {
            event.preventDefault();
            onSuppress();
          }}
        >
          <label htmlFor="sentinel-suppress-reason">Suppress with reason</label>
          <textarea
            id="sentinel-suppress-reason"
            value={suppressDraft}
            onChange={(event) => onSuppressDraft(event.target.value)}
            rows={2}
            placeholder="Why ignore this rule for now?"
            required
          />
          <button type="submit" className="text-button">
            <EyeOff aria-hidden="true" />
            Suppress rule
          </button>
        </form>
      )}
      {(isHidden || finding.suppressed) && (
        <p className="sentinel-suppressed-note">
          Suppressed
          {suppressReason ? `: ${suppressReason}` : finding.suppressed ? ' (project)' : ''}
        </p>
      )}
    </aside>
  );
}
