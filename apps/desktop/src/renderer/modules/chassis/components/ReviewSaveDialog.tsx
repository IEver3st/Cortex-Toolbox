import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Check, ShieldCheck, X, XCircle } from 'lucide-react';
import type { FieldChange, FileChangeSummary } from '../types';

const SECTION_ORDER = ['handling', 'vehicle-setup', 'appearance', 'identity'] as const;
const SECTION_LABELS: Record<(typeof SECTION_ORDER)[number], string> = {
  handling: 'Handling',
  'vehicle-setup': 'Vehicle setup',
  appearance: 'Appearance',
  identity: 'Identity',
};

export function ReviewSaveDialog({
  open,
  applying,
  changes,
  fileSummaries,
  blockingErrors,
  warnings,
  onClose,
  onApply,
}: {
  open: boolean;
  applying: boolean;
  changes: FieldChange[];
  fileSummaries: FileChangeSummary[];
  blockingErrors: number;
  warnings: number;
  onClose: () => void;
  onApply: () => void;
}): React.JSX.Element {
  const grouped = SECTION_ORDER.map((section) => ({
    section,
    label: SECTION_LABELS[section],
    items: changes.filter((change) => change.section === section),
  })).filter((group) => group.items.length > 0);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && !applying && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content chassis-review-dialog index-review-dialog">
          <div className="dialog-title">
            <div>
              <Dialog.Title>Review & save</Dialog.Title>
              <Dialog.Description>
                Linked metadata is written only after you confirm. Timestamped backups are created
                before replacement.
              </Dialog.Description>
            </div>
            <Dialog.Close type="button" aria-label="Close" disabled={applying}>
              <X />
            </Dialog.Close>
          </div>

          {grouped.map((group) => (
            <section key={group.section} className="chassis-review-group">
              <h3>{group.label}</h3>
              <ul className="chassis-review-change-list">
                {group.items.map((change) => (
                  <li key={change.id}>
                    <div>
                      <strong>{change.label}</strong>
                      <code>
                        {change.before} → {change.after}
                      </code>
                      <small>
                        {change.sourceFile} · {change.technicalName}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section className="chassis-review-group">
            <h3>Files to update</h3>
            <ul className="chassis-review-files">
              {fileSummaries.map((file) => (
                <li key={file.file}>
                  <code>{file.file}</code>
                  <span>{file.unchanged ? 'unchanged' : `${file.changeCount} changes`}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="index-review-validation">
            <h3>Validation</h3>
            {blockingErrors > 0 ? (
              <p className="index-review-blocked" role="alert">
                <XCircle aria-hidden="true" />
                {blockingErrors} blocking error{blockingErrors === 1 ? '' : 's'} must be resolved
                before saving.
              </p>
            ) : (
              <p className="index-review-ok">
                <Check aria-hidden="true" />
                No blocking errors detected.
              </p>
            )}
            {warnings > 0 ? (
              <p className="index-review-warn">
                <AlertTriangle aria-hidden="true" />
                {warnings} warning{warnings === 1 ? '' : 's'} — review recommended.
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
            <button
              type="button"
              className="primary"
              disabled={applying || blockingErrors > 0 || changes.length === 0}
              onClick={onApply}
            >
              {applying ? 'Saving…' : 'Save linked metadata'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
