import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { BrainCircuit, FileCode2, FolderOpen, FolderX, Search } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { MODULE_BY_ID } from '../../shared/modules';
import {
  dialogPop,
  motionDurations,
  overlayFade,
  transition,
  useReducedMotion,
} from '../lib/motion';
import { MODULE_ICONS } from '../modules/registry';
import { useModuleStore } from '../store/modules';
import { useWorkspaceStore } from '../store/workspace';
import { usePreferences } from '../hooks/usePreferences';
import { useAiStore } from '../ai/ai-store';

export function CommandPalette(): React.JSX.Element {
  const reduced = useReducedMotion();
  const paletteOpen = useWorkspaceStore((state) => state.paletteOpen);
  const setPalette = useWorkspaceStore((state) => state.setPalette);
  const setWorkspace = useWorkspaceStore((state) => state.setWorkspace);
  const closeWorkspace = useWorkspaceStore((state) => state.closeWorkspace);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const files = useWorkspaceStore((state) => state.files);
  const workspace = useWorkspaceStore((state) => state.workspace);
  const installed = useModuleStore((state) => state.installed);
  const aiEnabled = usePreferences().data?.aiEnabled === true;
  const setAiPanelOpen = useAiStore((state) => state.setPanelOpen);
  const run = (action: () => void) => {
    action();
    setPalette(false);
  };

  return (
    <Dialog.Root open={paletteOpen} onOpenChange={setPalette}>
      <AnimatePresence>
        {paletteOpen ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <m.div
                className="dialog-overlay command-overlay"
                initial={reduced ? false : overlayFade.initial}
                animate={overlayFade.animate}
                exit={reduced ? overlayFade.animate : overlayFade.exit}
                transition={transition(motionDurations.panel, reduced)}
              />
            </Dialog.Overlay>
            <Dialog.Content className="command-dialog" aria-label="Command palette">
              <m.div
                className="command-dialog-motion"
                initial={reduced ? false : dialogPop.initial}
                animate={dialogPop.animate}
                exit={reduced ? dialogPop.animate : dialogPop.exit}
                transition={transition(motionDurations.panel, reduced)}
              >
                <Dialog.Title className="sr-only">Search tools, commands, and files</Dialog.Title>
                <Dialog.Description className="sr-only">
                  Type to filter commands and workspace files. Use arrow keys to move and Enter to
                  open.
                </Dialog.Description>
                <Command>
                  <div className="command-input">
                    <Search aria-hidden="true" />
                    <Command.Input autoFocus placeholder="Search commands and files…" />
                  </div>
                  <Command.List>
                    <Command.Empty>
                      <strong>No matches</strong>
                      <span>Search tools, commands, or an indexed workspace file.</span>
                    </Command.Empty>
                    <Command.Group heading="Workspace">
                      <Command.Item
                        onSelect={() =>
                          run(() => {
                            void window.cortex.projects
                              .open()
                              .then(
                                (result) => result.ok && result.data && setWorkspace(result.data),
                              );
                          })
                        }
                      >
                        <FolderOpen />
                        <span>Open workspace</span>
                      </Command.Item>
                      {workspace ? (
                        <Command.Item
                          value="close workspace"
                          onSelect={() =>
                            run(() => {
                              void closeWorkspace();
                            })
                          }
                        >
                          <FolderX />
                          <span>Close workspace</span>
                        </Command.Item>
                      ) : null}
                    </Command.Group>
                    {aiEnabled && workspace ? (
                      <Command.Group heading="Cortex AI">
                        <Command.Item
                          value="cortex ai open"
                          onSelect={() => run(() => setAiPanelOpen(true))}
                        >
                          <BrainCircuit />
                          <span>Open Cortex AI</span>
                        </Command.Item>
                        <Command.Item
                          value="cortex ai new chat"
                          onSelect={() =>
                            run(() => {
                              useAiStore.getState().newThread(workspace.root);
                              setAiPanelOpen(true);
                            })
                          }
                        >
                          <BrainCircuit />
                          <span>New AI conversation</span>
                        </Command.Item>
                        <Command.Item
                          value="cortex ai ask current file"
                          disabled={
                            !useWorkspaceStore
                              .getState()
                              .tabs.find(
                                (item) => item.id === useWorkspaceStore.getState().activeTab,
                              )?.relativePath
                          }
                          onSelect={() =>
                            run(() =>
                              window.dispatchEvent(
                                new CustomEvent('cortex-ai:ask', {
                                  detail: { prompt: 'Inspect and explain the active file.' },
                                }),
                              ),
                            )
                          }
                        >
                          <FileCode2 />
                          <span>Ask about current file</span>
                        </Command.Item>
                        <Command.Item
                          value="cortex ai diagnose workspace"
                          onSelect={() =>
                            run(() =>
                              window.dispatchEvent(
                                new CustomEvent('cortex-ai:ask', {
                                  detail: {
                                    prompt:
                                      'Diagnose this workspace using deterministic Toolbox diagnostics first.',
                                  },
                                }),
                              ),
                            )
                          }
                        >
                          <BrainCircuit />
                          <span>Diagnose workspace</span>
                        </Command.Item>
                      </Command.Group>
                    ) : null}
                    <Command.Group heading="Modules">
                      {installed.map((id) => {
                        const module = MODULE_BY_ID[id];
                        const Icon = MODULE_ICONS[id];
                        return (
                          <Command.Item
                            key={id}
                            value={`${module.name} ${module.description} ${module.tags.join(' ')}`}
                            disabled={!workspace && module.workspaceRequired}
                            onSelect={() =>
                              run(() =>
                                openTab({
                                  id,
                                  label: module.tabLabel,
                                  relativePath:
                                    id === 'index'
                                      ? (workspace?.manifestName ?? 'fxmanifest.lua')
                                      : null,
                                  kind: id,
                                  dirty: false,
                                }),
                              )
                            }
                          >
                            <Icon />
                            <span>{module.name}</span>
                          </Command.Item>
                        );
                      })}
                    </Command.Group>
                    <Command.Group heading="Files">
                      {files.slice(0, 100).map((file) => (
                        <Command.Item
                          key={file.relativePath}
                          value={file.relativePath}
                          onSelect={() => {
                            void window.cortex.files
                              .read({ relativePath: file.relativePath })
                              .then((result) => {
                                if (result.ok)
                                  run(() =>
                                    openTab({
                                      id: `file:${file.relativePath}`,
                                      label: file.name,
                                      relativePath: file.relativePath,
                                      kind: 'file',
                                      dirty: false,
                                      content: result.data.content,
                                      readOnly: result.data.readOnly,
                                    }),
                                  );
                              });
                          }}
                        >
                          <FileCode2 />
                          <span className="command-file-path">{file.relativePath}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  </Command.List>
                </Command>
              </m.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
