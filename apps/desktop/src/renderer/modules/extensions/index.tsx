import { useQuery, useQueryClient } from '@tanstack/react-query';
import { builtInAdapters } from '@cortex/format-adapters';
import {
  Check,
  ChevronRight,
  FolderOpen,
  LockKeyhole,
  Plug,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '../../components/UiPrimitives';
import { unwrap } from '../../lib/result';
import { useWorkspaceStore } from '../../store/workspace';

async function openPluginFolder(): Promise<void> {
  try {
    const target = unwrap(await window.cortex.plugins.openFolder());
    toast.success(`Opened ${target}`);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Could not open the extension folder.');
  }
}

export default function Extensions(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const client = useQueryClient();
  const plugins = useQuery({
    queryKey: ['plugins', workspace?.root],
    queryFn: async () => unwrap(await window.cortex.plugins.list()),
    enabled: Boolean(workspace),
  });
  const [selectedId, setSelectedId] = useState('');
  const selectedPlugin =
    plugins.data?.find((plugin) => plugin.manifest.id === selectedId) ?? plugins.data?.[0];
  const grantedPermissions = useMemo(
    () => new Set(selectedPlugin?.granted ?? []),
    [selectedPlugin],
  );

  const setGrant = async (
    pluginId: string,
    permissions: (
      | 'workspace:read'
      | 'workspace:write'
      | 'archives:create'
      | 'external-tool:execute'
      | 'network:https'
    )[],
  ) => {
    try {
      unwrap(await window.cortex.plugins.grant({ pluginId, permissions }));
      await client.invalidateQueries({ queryKey: ['plugins', workspace?.root] });
      toast.success(permissions.length ? 'Preview grants recorded.' : 'Preview grants cleared.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Permission update failed.');
    }
  };

  return (
    <div className="page-scroll workbench-page module-page">
      <div className="extensions-grid">
        <section className="data-card">
          <div className="card-heading">
            <div>
              <h2>Discovered manifests</h2>
              <p>.cortex/plugins/&lt;id&gt;/plugin.json</p>
            </div>
            <div className="card-heading-actions">
              <span className="badge neutral">{plugins.data?.length ?? 0} found</span>
              <button
                type="button"
                className="icon-button"
                disabled={!workspace}
                aria-label="Open extension folder"
                onClick={() => void openPluginFolder()}
              >
                <FolderOpen />
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={!workspace || plugins.isFetching}
                aria-label="Refresh extensions"
                onClick={() => void plugins.refetch()}
              >
                <RefreshCw />
              </button>
            </div>
          </div>
          {!workspace ? (
            <EmptyState
              icon={Plug}
              title="Open a workspace"
              description="Extension discovery is isolated to the current project."
            />
          ) : plugins.data?.length ? (
            <div className="plugin-list extension-picker">
              {plugins.data.map((plugin) => (
                <button
                  type="button"
                  key={plugin.manifest.id}
                  className={selectedPlugin?.manifest.id === plugin.manifest.id ? 'active' : ''}
                  onClick={() => setSelectedId(plugin.manifest.id)}
                >
                  <div className="plugin-title">
                    <span>
                      <Plug />
                    </span>
                    <div>
                      <strong>{plugin.manifest.name}</strong>
                      <small>
                        {plugin.manifest.id} · v{plugin.manifest.version}
                      </small>
                    </div>
                    <span className={`permission-state ${plugin.granted.length ? 'granted' : ''}`}>
                      {plugin.granted.length ? `${plugin.granted.length} preview grants` : 'Inert'}
                    </span>
                  </div>
                  <ChevronRight />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Plug}
              title="No extension manifests"
              description="Add plugin.json under .cortex/plugins/<id> to register one."
            />
          )}
        </section>
        <section className="data-card extension-details">
          <div className="card-heading">
            <div>
              <h2>{selectedPlugin?.manifest.name ?? 'Extension security'}</h2>
              <p>
                {selectedPlugin
                  ? `${selectedPlugin.manifest.id} · v${selectedPlugin.manifest.version}`
                  : 'Explicit discovery and permission grants'}
              </p>
            </div>
          </div>
          {selectedPlugin ? (
            <>
              <div className="permission-list details">
                {selectedPlugin.manifest.permissions.map((permission) => (
                  <span key={permission}>
                    {grantedPermissions.has(permission) ? <Check /> : <LockKeyhole />}
                    {permission}
                  </span>
                ))}
              </div>
              <div className="plugin-actions">
                <button type="button" onClick={() => void setGrant(selectedPlugin.manifest.id, [])}>
                  Clear preview grants
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() =>
                    void setGrant(selectedPlugin.manifest.id, selectedPlugin.manifest.permissions)
                  }
                >
                  Record declared grants
                </button>
              </div>
            </>
          ) : (
            <div className="extension-guidance">
              <ShieldCheck />
              <div>
                <strong>Manifest preview only</strong>
                <p>
                  Cortex validates manifests and records preview grants. Extension code does not run
                  in version 1.0.
                </p>
              </div>
              <button type="button" disabled={!workspace} onClick={() => void openPluginFolder()}>
                <FolderOpen />
                Open extension folder
              </button>
            </div>
          )}
          <div className="capability-heading">
            <h3>Format capabilities</h3>
            <p>Unsupported writes stay disabled and are labeled in words.</p>
          </div>
          <div className="adapter-list">
            {builtInAdapters.map((adapter) => (
              <article key={adapter.id}>
                <div>
                  <strong>{adapter.name}</strong>
                  <small>{adapter.supportedExtensions.join(' · ')}</small>
                </div>
                <span
                  className={`badge ${adapter.write === 'fully-supported' ? 'success' : 'neutral'}`}
                >
                  {adapter.write.replaceAll('-', ' ')}
                </span>
                <p>{adapter.knownLimitations[0]}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
