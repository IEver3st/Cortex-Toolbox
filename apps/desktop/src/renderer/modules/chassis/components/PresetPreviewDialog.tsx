import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { HANDLING_PRESETS, type HandlingPresetId } from '@cortex/vehicle-meta';
import type { FieldChange } from '../types';
import { affectedCategories, HANDLING_CATEGORY_LABELS } from '../chassis-utils';

export function PresetPreviewDialog({
  presetId,
  changes,
  untouchedCount,
  open,
  onClose,
  onApply,
}: {
  presetId: HandlingPresetId;
  changes: FieldChange[];
  untouchedCount: number;
  open: boolean;
  onClose: () => void;
  onApply: () => void;
}): React.JSX.Element {
  const preset = HANDLING_PRESETS[presetId];
  const categories = affectedCategories(changes);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content chassis-review-dialog">
          <div className="dialog-title">
            <div>
              <Dialog.Title>Preview preset · {preset.label}</Dialog.Title>
              <Dialog.Description>{preset.description}</Dialog.Description>
            </div>
            <Dialog.Close type="button" aria-label="Close">
              <X />
            </Dialog.Close>
          </div>

          <dl className="chassis-review-stats">
            <div>
              <dt>Fields changed</dt>
              <dd>{changes.length}</dd>
            </div>
            <div>
              <dt>Unchanged</dt>
              <dd>{untouchedCount}</dd>
            </div>
            <div>
              <dt>Categories affected</dt>
              <dd>{categories.length}</dd>
            </div>
          </dl>

          {categories.length > 0 ? (
            <p className="chassis-review-categories">
              {categories.map((category) => HANDLING_CATEGORY_LABELS[category]).join(' · ')}
            </p>
          ) : (
            <p className="chassis-review-categories">No handling values would change.</p>
          )}

          {changes.length > 0 ? (
            <ul className="chassis-review-change-list">
              {changes.slice(0, 24).map((change) => (
                <li key={change.id}>
                  <span>{change.label}</span>
                  <code>
                    {change.before} → {change.after}
                  </code>
                </li>
              ))}
              {changes.length > 24 ? (
                <li className="muted">…and {changes.length - 24} more</li>
              ) : null}
            </ul>
          ) : null}

          <div className="dialog-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={onApply}>
              Apply preset
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
