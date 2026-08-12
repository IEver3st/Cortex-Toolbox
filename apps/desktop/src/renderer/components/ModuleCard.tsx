import { Download, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { ModuleDefinition } from '../../shared/modules';
import { useReducedMotion } from '../lib/motion';
import { useModuleStore } from '../store/modules';
import { MODULE_ICONS } from '../modules/registry';
import { ProgressBar } from './ProgressBar';

type RowPhase = 'idle' | 'installing' | 'removing';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Compact module row for the Overview capabilities list. */
export function ModuleRow({
  module,
  onOpen,
}: {
  module: ModuleDefinition;
  onOpen?: (module: ModuleDefinition) => void;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  const installed = useModuleStore((state) => state.isInstalled(module.id));
  const install = useModuleStore((state) => state.install);
  const uninstall = useModuleStore((state) => state.uninstall);
  const [phase, setPhase] = useState<RowPhase>('idle');
  const [installProgress, setInstallProgress] = useState(0);
  const Icon = MODULE_ICONS[module.id];
  const busy = phase !== 'idle';

  useEffect(() => {
    if (phase !== 'installing') return;
    setInstallProgress(0);
    const frame = window.requestAnimationFrame(() => setInstallProgress(0.92));
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  const runInstall = async () => {
    if (reduced) {
      try {
        await install(module.id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Module operation failed.');
      }
      return;
    }

    setPhase('installing');
    try {
      await wait(520);
      setInstallProgress(1);
      await wait(160);
      await install(module.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Module operation failed.');
    } finally {
      setPhase('idle');
      setInstallProgress(0);
    }
  };

  const runRemove = async () => {
    if (reduced) {
      try {
        await uninstall(module.id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Module operation failed.');
      }
      return;
    }

    setPhase('removing');
    try {
      await wait(220);
      await uninstall(module.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Module operation failed.');
    } finally {
      setPhase('idle');
    }
  };

  const toggle = async () => {
    if (installed) await runRemove();
    else await runInstall();
  };

  const actionLabel = installed
    ? phase === 'removing'
      ? 'Removing'
      : 'Remove'
    : phase === 'installing'
      ? 'Installing'
      : 'Install';

  return (
    <article
      className={`module-row${installed ? ' is-installed' : ''}${busy ? ' is-busy' : ''}${
        phase === 'installing' ? ' is-installing' : ''
      }${phase === 'removing' ? ' is-removing' : ''}`}
      aria-busy={busy}
    >
      <span className="module-row-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="module-row-copy">
        <h4>{module.shortName}</h4>
        <p>{module.description}</p>
      </div>

      <div className="module-row-actions">
        {installed && onOpen && (
          <button type="button" className="ghost" onClick={() => onOpen(module)} disabled={busy}>
            Open
          </button>
        )}
        <button
          type="button"
          className={installed ? 'ghost module-row-remove' : 'primary'}
          onClick={() => void toggle()}
          disabled={busy || module.required}
          aria-pressed={installed}
        >
          {phase === 'installing' || phase === 'removing' ? (
            <Loader2 className="is-spinning" aria-hidden="true" />
          ) : installed ? (
            <Trash2 aria-hidden="true" />
          ) : (
            <Download aria-hidden="true" />
          )}
          {actionLabel}
        </button>
      </div>

      {phase === 'installing' && (
        <ProgressBar
          className="module-row-progress"
          value={installProgress}
          label="Installing module"
        />
      )}
    </article>
  );
}
