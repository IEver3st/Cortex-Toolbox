import { HelpCircle } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import { shortPath } from './utils';

export function SentinelScanContext({
  scopeName,
  workspaceRoot,
  manifestName,
  filesIndexed,
}: {
  scopeName: string;
  workspaceRoot: string;
  manifestName: string | null;
  filesIndexed: number;
}): React.JSX.Element {
  return (
    <aside className="sentinel-scan-context" aria-label="Workspace context">
      <h3 className="sentinel-section-label">Workspace context</h3>
      <dl className="sentinel-context-list">
        <div>
          <dt>Workspace</dt>
          <dd title={workspaceRoot}>{scopeName}</dd>
        </div>
        <div>
          <dt>Manifest</dt>
          <dd className={manifestName ? 'mono' : 'is-attention'}>
            {manifestName ?? 'Not detected'}
          </dd>
        </div>
        <div>
          <dt>Files indexed</dt>
          <dd>{filesIndexed > 0 ? filesIndexed.toLocaleString() : '—'}</dd>
        </div>
        <div>
          <dt>Scan mode</dt>
          <dd>
            <Tooltip
              content="Sentinel performs static checks only. Project scripts are never executed."
              side="left"
            >
              <span className="sentinel-mode-label">
                Static validation
                <HelpCircle aria-hidden="true" />
              </span>
            </Tooltip>
          </dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd className="mono" title={workspaceRoot}>
            {shortPath(workspaceRoot)}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
