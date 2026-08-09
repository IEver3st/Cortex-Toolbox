import * as Dialog from '@radix-ui/react-dialog';
import { FilePlus2, X } from 'lucide-react';
import { useEffect, useState, type SyntheticEvent } from 'react';

export interface CreateHandlingInput {
  handlingName: string;
  relativePath: string;
}

export function CreateHandlingDialog({
  open,
  busy,
  defaultPath,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  busy: boolean;
  defaultPath: string;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreateHandlingInput) => Promise<void>;
}): React.JSX.Element {
  const [handlingName, setHandlingName] = useState('');
  const [relativePath, setRelativePath] = useState(defaultPath);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setHandlingName('');
    setRelativePath(defaultPath);
    setError(null);
  }, [defaultPath, open]);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = handlingName.trim();
    const target = relativePath.trim().replaceAll('\\', '/');
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      setError('Use letters, numbers, and underscores for the handling name.');
      return;
    }
    const segments = target.split('/');
    if (
      !target ||
      target.startsWith('/') ||
      /^[A-Za-z]:/.test(target) ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      setError('Choose a workspace-relative path such as handling.meta or data/handling.meta.');
      return;
    }
    if (segments.at(-1)?.toLowerCase() !== 'handling.meta') {
      setError('The file must be named handling.meta.');
      return;
    }
    setError(null);
    try {
      await onCreate({ handlingName: name, relativePath: target });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create handling.meta.');
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content chassis-create-dialog">
          <div className="dialog-title">
            <div>
              <Dialog.Title>Create handling</Dialog.Title>
              <Dialog.Description>
                Create one editable handling.meta in this workspace. No other metadata files will be
                generated.
              </Dialog.Description>
            </div>
            <Dialog.Close type="button" aria-label="Close create handling dialog" disabled={busy}>
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>
          <form onSubmit={(event) => void submit(event)}>
            <label>
              Handling name
              <input
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={handlingName}
                placeholder="GSDGATOR"
                onChange={(event) => setHandlingName(event.target.value)}
              />
              <small>Written exactly as entered and used as the CHandlingData identity.</small>
            </label>
            <label>
              Workspace path
              <input
                autoComplete="off"
                spellCheck={false}
                value={relativePath}
                placeholder="data/handling.meta"
                onChange={(event) => setRelativePath(event.target.value)}
              />
              <small>The target must stay inside this workspace and must not already exist.</small>
            </label>
            {error ? (
              <p className="field-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button type="button" disabled={busy}>
                  Cancel
                </button>
              </Dialog.Close>
              <button type="submit" className="primary" disabled={busy}>
                <FilePlus2 aria-hidden="true" />
                {busy ? 'Creating…' : 'Create handling'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
