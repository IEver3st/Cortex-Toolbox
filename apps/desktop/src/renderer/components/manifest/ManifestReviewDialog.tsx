import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Check, FileWarning, ShieldCheck, X, XCircle } from 'lucide-react';
import type { ChangePlan } from '@cortex/core';
import { formatBytes } from '../../lib/result';
import type { ManifestProblem } from './manifest-utils';
import { keyedDiffLines } from './manifest-utils';

export interface ManifestReviewDialogProps {
  plan: ChangePlan | null;
  relativePath: string;
  isNewFile: boolean;
  applying: boolean;
  lineDiff: { added: string[]; removed: string[] } | null;
  problems: ManifestProblem[];
  manualReviewCount: number;
  hasBlockingErrors: boolean;
  onClose: () => void;
  onApply: () => void;
  forceSaveDespiteErrors?: (() => void) | undefined;
}

export function ManifestReviewDialog({
  plan,
  relativePath,
  isNewFile,
  applying,
  lineDiff,
  problems,
  manualReviewCount,
  hasBlockingErrors,
  onClose,
  onApply,
  forceSaveDespiteErrors,
}: ManifestReviewDialogProps): React.JSX.Element {
  const errors = problems.filter((item) => item.severity === 'error');
  const warnings = problems.filter((item) => item.severity === 'warning');

  return (
    <Dialog.Root open={Boolean(plan)} onOpenChange={(open) => !open && !applying && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content index-review-dialog">
          <div className="dialog-title">
            <div>
              <Dialog.Title>Review & save</Dialog.Title>
              <Dialog.Description>
                No file is written until you confirm. {isNewFile ? 'Creating' : 'Updating'}{' '}
                <code>{relativePath}</code>.
              </Dialog.Description>
            </div>
            <Dialog.Close type="button" aria-label="Close" disabled={applying}>
              <X />
            </Dialog.Close>
          </div>

          {plan?.entries.map((entry) => (
            <div className="change-entry" key={entry.id}>
              <span className={`change-kind ${entry.kind}`}>{entry.kind}</span>
              <code>{entry.relativePath}</code>
              <span>
                {formatBytes(entry.beforeBytes ?? 0)} → {formatBytes(entry.afterBytes ?? 0)}
              </span>
            </div>
          ))}

          {lineDiff && (lineDiff.added.length > 0 || lineDiff.removed.length > 0) ? (
            <div className="manifest-line-diff" aria-label="Text diff summary">
              <strong>
                Line changes · +{lineDiff.added.length} / −{lineDiff.removed.length}
              </strong>
              <pre className="manifest-diff-preview">
                {keyedDiffLines(lineDiff.removed.slice(0, 60), 'removed').map((row) => (
                  <span key={row.key} className="diff-removed">
                    − {row.line}
                    {'\n'}
                  </span>
                ))}
                {keyedDiffLines(lineDiff.added.slice(0, 60), 'added').map((row) => (
                  <span key={row.key} className="diff-added">
                    + {row.line}
                    {'\n'}
                  </span>
                ))}
                {lineDiff.added.length > 60 || lineDiff.removed.length > 60 ? (
                  <span className="muted">…truncated for readability</span>
                ) : null}
              </pre>
            </div>
          ) : null}

          <div className="index-review-validation">
            <h3>Validation</h3>
            {hasBlockingErrors ? (
              <p className="index-review-blocked" role="alert">
                <XCircle aria-hidden="true" />
                {errors.length} blocking error{errors.length === 1 ? '' : 's'} must be resolved
                before saving.
              </p>
            ) : (
              <p className="index-review-ok">
                <Check aria-hidden="true" />
                No blocking errors detected.
              </p>
            )}
            {warnings.length > 0 ? (
              <p className="index-review-warn">
                <AlertTriangle aria-hidden="true" />
                {warnings.length} warning{warnings.length === 1 ? '' : 's'} — review recommended.
              </p>
            ) : null}
            {manualReviewCount > 0 ? (
              <p className="index-review-preserve">
                <FileWarning aria-hidden="true" />
                {manualReviewCount} declaration{manualReviewCount === 1 ? '' : 's'} preserved for
                manual review — they remain byte-for-byte intact and are not removed or fixed by
                this save.
              </p>
            ) : null}
          </div>

          <div className="safety-note">
            <ShieldCheck aria-hidden="true" />
            Existing files receive a timestamped backup under <code>.cortex/backups/</code> before
            atomic replacement.
          </div>

          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button type="button" disabled={applying}>
                Cancel
              </button>
            </Dialog.Close>
            {hasBlockingErrors && forceSaveDespiteErrors ? (
              <button type="button" disabled={applying} onClick={forceSaveDespiteErrors}>
                Save source anyway
              </button>
            ) : null}
            <button
              type="button"
              className="primary"
              disabled={applying || hasBlockingErrors}
              onClick={onApply}
            >
              {applying ? 'Saving…' : 'Save manifest'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
