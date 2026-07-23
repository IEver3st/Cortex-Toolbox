import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Cable,
  CheckCircle2,
  Clock3,
  Copy,
  FileCode2,
  FolderOpen,
  FolderPlus,
  Info,
  Layers,
  MoreHorizontal,
  Package,
  ScanSearch,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'motion/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { projectTypeSchema } from '@cortex/project-schema';
import { z } from 'zod';
import type { RecentWorkspaceDetail } from '../../shared/contracts';
import {
  latestActivityByTool,
  latestActivityForWorkspace,
  listActivities,
  type ActivityEntry,
  type ActivityStatus,
  type ActivityTool,
} from '../lib/activity-history';
import { copyText } from '../lib/clipboard';
import { motionDurations, panelRevealMotion, stateMotion, useReducedMotion } from '../lib/motion';
import { formatRelativeTime } from '../lib/relative-time';
import { unwrap } from '../lib/result';
import { useWorkspaceStore, type EditorTab } from '../store/workspace';
import { type ContextMenuItem } from './ContextMenu';

const formSchema = z.object({
  name: z.string().trim().min(1, 'Enter a project name.').max(120),
  type: projectTypeSchema,
});
type FormData = z.infer<typeof formSchema>;

const INTRO_URL =
  'https://docs.fivem.net/docs/scripting-reference/resource-manifest/resource-manifest/';

const VISIBLE_RECENTS_DEFAULT = 5;
const MIN_ACTIVITY_SECTION = 2;
const SEARCH_CONTROLS_THRESHOLD = 5;

const TOOL_META: Record<
  ActivityTool,
  { label: string; icon: LucideIcon; moduleKind: EditorTab['kind'] }
> = {
  probe: { label: 'Probe', icon: ScanSearch, moduleKind: 'probe' },
  sentinel: { label: 'Sentinel', icon: ShieldCheck, moduleKind: 'sentinel' },
  bundle: { label: 'Bundle', icon: Package, moduleKind: 'bundle' },
  wire: { label: 'Wire', icon: Cable, moduleKind: 'wire' },
  chassis: { label: 'Chassis', icon: Package, moduleKind: 'chassis' },
};

type WorkspaceStateTone = 'healthy' | 'neutral' | 'info' | 'warning' | 'error';

interface WorkspaceState {
  label: string;
  tone: WorkspaceStateTone;
}

interface ContextualRecommendation {
  title: string;
  cta: string;
  icon: LucideIcon;
  onAction: () => void;
}

function normalizeRoot(root: string): string {
  return root.replace(/[\\/]+$/, '').toLowerCase();
}

function dedupeRecents(items: RecentWorkspaceDetail[]): RecentWorkspaceDetail[] {
  const seen = new Map<string, RecentWorkspaceDetail>();
  for (const item of items) {
    const key = normalizeRoot(item.root);
    const existing = seen.get(key);
    if (!existing || Date.parse(item.openedAt) > Date.parse(existing.openedAt)) {
      seen.set(key, item);
    }
  }
  return [...seen.values()].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
}

function kindLabel(
  kind: RecentWorkspaceDetail['kind'],
  projectType: string | null,
  hasManifest: boolean,
): string {
  if (projectType) return `${projectType} project`;
  if (!hasManifest && kind === 'unknown') return 'Folder';
  switch (kind) {
    case 'script':
      return 'Script resource';
    case 'asset':
      return 'Asset pack';
    case 'mixed':
      return 'Mixed resource';
    case 'empty':
      return hasManifest ? 'Resource shell' : 'Empty folder';
    default:
      return hasManifest ? 'FiveM resource' : 'Local folder';
  }
}

function middleTruncatePath(value: string, max = 58): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function workspaceIcon(kind: RecentWorkspaceDetail['kind'], hasManifest: boolean): LucideIcon {
  if (!hasManifest) return FolderOpen;
  if (kind === 'script') return FileCode2;
  if (kind === 'asset') return Package;
  if (kind === 'mixed') return Layers;
  return FolderOpen;
}

function resolveWorkspaceState(item: RecentWorkspaceDetail): WorkspaceState {
  const validation = latestActivityByTool('sentinel', item.root);
  const chassis = latestActivityByTool('chassis', item.root);

  if (!item.hasManifest) {
    return { label: 'Manifest missing', tone: 'warning' };
  }
  if (item.kind === 'mixed') {
    return { label: 'Mixed scope', tone: 'info' };
  }
  if (validation?.status === 'error') {
    const match = /(\d+)\s+error/i.exec(validation.summary);
    return {
      label: match ? `${match[1]} error${match[1] === '1' ? '' : 's'}` : 'Blocking issues',
      tone: 'error',
    };
  }
  if (validation?.status === 'warning') {
    const match = /(\d+)\s+warning/i.exec(validation.summary);
    return {
      label: match ? `${match[1]} warning${match[1] === '1' ? '' : 's'}` : validation.summary,
      tone: 'warning',
    };
  }
  if (chassis?.summary.toLowerCase().includes('unsaved')) {
    return { label: 'Unsaved changes', tone: 'warning' };
  }
  if (!validation) {
    return { label: 'Not analyzed', tone: 'neutral' };
  }
  return { label: 'Healthy', tone: 'healthy' };
}

function continueHealthLine(item: RecentWorkspaceDetail): string {
  const validation = latestActivityByTool('sentinel', item.root);
  if (!item.hasManifest) return 'Manifest missing at workspace root';
  if (validation?.status === 'error') return validation.summary;
  if (validation?.status === 'warning') return validation.summary;
  if (!validation) return 'Not analyzed yet';
  return 'No blocking issues';
}

function activitySentence(entry: ActivityEntry): string {
  const meta = TOOL_META[entry.tool];
  const workspace = entry.workspaceName || 'workspace';
  return `${meta.label} ${entry.summary} in ${workspace}`;
}

function resolveContextualRecommendation(
  recents: RecentWorkspaceDetail[],
  openWorkspace: (root: string) => void,
  openModule: (kind: EditorTab['kind'], label: string) => void,
): ContextualRecommendation | null {
  const validRecent = recents.find((entry) => entry.exists) ?? null;
  const targetRoot = validRecent?.root ?? recents[0]?.root;
  if (!targetRoot) return null;

  const validation = latestActivityByTool('sentinel', targetRoot);
  if (validation?.status === 'error') {
    return {
      title: 'Resolve Sentinel errors',
      cta: 'Review validation',
      icon: ShieldCheck,
      onAction: () => openModule('sentinel', validation.navigate.tabLabel),
    };
  }
  if (validation?.status === 'warning') {
    return {
      title: 'Review validation warnings',
      cta: 'Open Sentinel',
      icon: ShieldCheck,
      onAction: () => openModule('sentinel', validation.navigate.tabLabel),
    };
  }

  const wire = latestActivityByTool('wire', targetRoot);
  if (wire && wire.status !== 'error') {
    return {
      title: 'Continue reviewing Wire results',
      cta: 'Open Wire',
      icon: Cable,
      onAction: () => openModule('wire', wire.navigate.tabLabel),
    };
  }

  const chassis = latestActivityByTool('chassis', targetRoot);
  if (chassis?.summary.toLowerCase().includes('unsaved')) {
    return {
      title: 'Finish unsaved Chassis changes',
      cta: 'Open Chassis',
      icon: Package,
      onAction: () => openModule('chassis', chassis.navigate.tabLabel),
    };
  }

  const bundle = latestActivityByTool('bundle', targetRoot);
  if (bundle?.status === 'error') {
    return {
      title: 'Retry failed Bundle export',
      cta: 'Open Bundle',
      icon: Package,
      onAction: () => openModule('bundle', bundle.navigate.tabLabel),
    };
  }

  if (validRecent?.kind === 'mixed') {
    return {
      title: 'Choose a resource root from this mixed folder',
      cta: 'Open workspace',
      icon: Layers,
      onAction: () => openWorkspace(validRecent.root),
    };
  }

  const probe = latestActivityByTool('probe', targetRoot);
  if (probe?.status === 'warning') {
    return {
      title: 'Review Probe warnings',
      cta: 'Open Probe',
      icon: ScanSearch,
      onAction: () => openModule('probe', probe.navigate.tabLabel),
    };
  }

  if (validRecent && !validRecent.hasManifest) {
    return {
      title: 'Add a resource manifest',
      cta: 'Open Index',
      icon: FileCode2,
      onAction: () => {
        openWorkspace(validRecent.root);
        openModule('index', 'Index');
      },
    };
  }

  if (!bundle && validation?.status === 'success') {
    return {
      title: 'Preview the release package',
      cta: 'Open Bundle',
      icon: Package,
      onAction: () => openModule('bundle', 'Bundle'),
    };
  }

  return null;
}

function statusIcon(status: ActivityStatus): React.JSX.Element {
  if (status === 'error') return <AlertTriangle aria-hidden="true" />;
  if (status === 'warning') return <AlertTriangle aria-hidden="true" />;
  if (status === 'success') return <CheckCircle2 aria-hidden="true" />;
  return <Info aria-hidden="true" />;
}

function OverflowMenu({
  label,
  items,
}: {
  label: string;
  items: ContextMenuItem[];
}): React.JSX.Element {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const enabledIndexes = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.disabled)
    .map(({ index }) => index);

  const close = useCallback(() => {
    setOpen(false);
    setCoords(null);
  }, []);

  const runItem = useCallback(
    (item: ContextMenuItem) => {
      if (item.disabled) return;
      close();
      window.setTimeout(() => item.onSelect?.(), 0);
    },
    [close],
  );

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !buttonRef.current) return;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const pad = 8;
    const left = Math.min(
      Math.max(pad, buttonRect.right - menuRect.width),
      window.innerWidth - menuRect.width - pad,
    );
    const top = Math.min(buttonRect.bottom + 4, window.innerHeight - menuRect.height - pad);
    setCoords({ top, left });
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('mousedown', onPointer, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointer, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [close, open]);

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className="cortex-context-menu"
            style={
              coords
                ? { top: coords.top, left: coords.left }
                : { top: -9999, left: -9999, visibility: 'hidden' }
            }
            onKeyDown={(event) => {
              if (!enabledIndexes.length) return;
              const currentPos = Math.max(0, enabledIndexes.indexOf(activeIndex));
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex(enabledIndexes[(currentPos + 1) % enabledIndexes.length] ?? 0);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex(
                  enabledIndexes[
                    (currentPos - 1 + enabledIndexes.length) % enabledIndexes.length
                  ] ?? 0,
                );
              } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const item = items[activeIndex];
                if (item) runItem(item);
              }
            }}
          >
            {items.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="cortex-context-menu-group">
                  {item.separator ? (
                    <div className="cortex-context-menu-separator" role="separator" />
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className={[
                      'cortex-context-menu-item',
                      item.danger ? 'is-danger' : '',
                      index === activeIndex ? 'is-active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={item.disabled}
                    tabIndex={index === activeIndex ? 0 : -1}
                    onMouseEnter={() => {
                      if (!item.disabled) setActiveIndex(index);
                    }}
                    onClick={() => runItem(item)}
                  >
                    <span className="cortex-context-menu-icon" aria-hidden="true">
                      {Icon ? <Icon /> : null}
                    </span>
                    <span className="cortex-context-menu-label">{item.label}</span>
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="launchpad-row-menu"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setActiveIndex(enabledIndexes[0] ?? 0);
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
      {menu}
    </>
  );
}

function workspaceMenuItems(
  item: RecentWorkspaceDetail,
  openWorkspace: (root: string) => void,
  removeRecent: (root: string) => void,
): ContextMenuItem[] {
  return [
    {
      id: 'open',
      label: 'Open',
      icon: FolderOpen,
      onSelect: () => openWorkspace(item.root),
    },
    {
      id: 'explorer',
      label: 'Reveal in Explorer',
      icon: FolderOpen,
      onSelect: () => {
        void window.cortex.projects.reveal({ root: item.root });
      },
    },
    {
      id: 'copy',
      label: 'Copy path',
      icon: Copy,
      separator: true,
      onSelect: () => {
        void copyText(item.root).then((ok) => {
          if (ok) toast.success('Path copied');
          else toast.error('Could not copy path');
        });
      },
    },
    {
      id: 'remove',
      label: 'Remove from recents',
      icon: Trash2,
      danger: true,
      separator: true,
      onSelect: () => removeRecent(item.root),
    },
  ];
}

export function HomeModuleHub(): React.JSX.Element {
  const reduced = useReducedMotion();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const [activities, setActivities] = useState<ActivityEntry[]>(() => listActivities());
  const [recentQuery, setRecentQuery] = useState('');
  const [showAllRecents, setShowAllRecents] = useState(false);
  const [focusedRow, setFocusedRow] = useState(-1);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const setWorkspace = useWorkspaceStore((state) => state.setWorkspace);
  const openTab = useWorkspaceStore((state) => state.openTab);

  const recents = useQuery({
    queryKey: ['recent-workspaces-details'],
    queryFn: async () => unwrap(await window.cortex.projects.recentDetails()),
  });

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ defaultValues: { name: '', type: 'script' } });

  const refreshActivities = useCallback(() => {
    setActivities(listActivities());
  }, []);

  useEffect(() => {
    refreshActivities();
    const onFocus = () => refreshActivities();
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'cortex.activityHistory') refreshActivities();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, [refreshActivities]);

  const openModule = useCallback(
    (kind: EditorTab['kind'], label: string) => {
      openTab({
        id: kind,
        label,
        relativePath: kind === 'index' ? 'fxmanifest.lua' : null,
        kind,
        dirty: false,
      });
    },
    [openTab],
  );

  const openWorkspace = useCallback(
    async (root: string) => {
      try {
        const opened = unwrap(await window.cortex.projects.openFolder({ root }));
        setWorkspace(opened);
        void recents.refetch();
        refreshActivities();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'That folder is no longer available. Open a workspace manually.',
        );
        void recents.refetch();
      }
    },
    [recents, refreshActivities, setWorkspace],
  );

  const openFolder = async () => {
    try {
      const result = unwrap(await window.cortex.projects.open());
      if (result) setWorkspace(result);
      void recents.refetch();
      refreshActivities();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cortex could not open that folder.');
    }
  };

  const importResource = async () => {
    try {
      const result = unwrap(await window.cortex.projects.import());
      if (result) setWorkspace(result);
      void recents.refetch();
      refreshActivities();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cortex could not import that folder.');
    }
  };

  const openDropped = async (root: string) => {
    try {
      setWorkspace(unwrap(await window.cortex.projects.openFolder({ root })));
      void recents.refetch();
      refreshActivities();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cortex could not open that folder.');
    }
  };

  const removeRecent = async (root: string) => {
    unwrap(await window.cortex.projects.removeRecent({ root }));
    void recents.refetch();
    toast.success('Removed from recents');
  };

  const submit = handleSubmit(async (input) => {
    const parsed = formSchema.safeParse(input);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) =>
        setError(issue.path[0] as keyof FormData, { message: issue.message }),
      );
      return;
    }
    try {
      setWorkspace(unwrap(await window.cortex.projects.create(parsed.data)));
      setDialogOpen(false);
      reset({ name: '', type: 'script' });
      void recents.refetch();
      refreshActivities();
      toast.success('Project created. Your source remains local.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cortex could not create the project.');
    }
  });

  const openActivity = async (entry: ActivityEntry) => {
    if (entry.workspaceRoot) {
      const current = useWorkspaceStore.getState().workspace;
      if (!current || normalizeRoot(current.root) !== normalizeRoot(entry.workspaceRoot)) {
        try {
          setWorkspace(
            unwrap(await window.cortex.projects.openFolder({ root: entry.workspaceRoot })),
          );
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not open that workspace.');
          return;
        }
      }
    }
    openModule(entry.navigate.kind, entry.navigate.tabLabel);
  };

  const recentList = useMemo(() => dedupeRecents(recents.data ?? []), [recents.data]);

  const visibleActivities = useMemo(
    () => activities.filter((entry) => Boolean(TOOL_META[entry.tool])),
    [activities],
  );

  const existingRecents = useMemo(() => recentList.filter((entry) => entry.exists), [recentList]);
  const missingRecents = useMemo(() => recentList.filter((entry) => !entry.exists), [recentList]);
  const isFirstRun = recentList.length === 0 && visibleActivities.length === 0;

  const continueWorkspace = existingRecents[0] ?? null;
  const continueActivity = continueWorkspace
    ? latestActivityForWorkspace(continueWorkspace.root)
    : null;

  const contextual =
    isFirstRun || !continueWorkspace
      ? null
      : resolveContextualRecommendation(recentList, (root) => void openWorkspace(root), openModule);

  const showContextual =
    contextual &&
    !(
      contextual.title.toLowerCase().includes('open workspace') &&
      contextual.cta.toLowerCase() === 'open workspace'
    );

  const filteredRecents = useMemo(() => {
    const query = recentQuery.trim().toLowerCase();
    const pool = existingRecents;
    if (!query) return pool;
    return pool.filter(
      (item) => item.name.toLowerCase().includes(query) || item.root.toLowerCase().includes(query),
    );
  }, [existingRecents, recentQuery]);

  const visibleRecents = showAllRecents
    ? filteredRecents
    : filteredRecents.slice(0, VISIBLE_RECENTS_DEFAULT);

  const visibleMissing = missingRecents.slice(0, 2);
  const hiddenMissingCount = Math.max(0, missingRecents.length - visibleMissing.length);

  const timelineActivities = visibleActivities;
  const showActivitySection = timelineActivities.length >= MIN_ACTIVITY_SECTION;
  const loneActivity =
    timelineActivities.length === 1 && continueWorkspace ? timelineActivities[0] : null;

  const ContextualIcon = contextual?.icon;

  const showRecentControls = existingRecents.length >= SEARCH_CONTROLS_THRESHOLD;

  const isDragging = dragDepth > 0;

  const onDragEnter = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    setDragDepth((value) => value + 1);
  };

  const onDragLeave = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    setDragDepth((value) => Math.max(0, value - 1));
  };

  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragDepth(0);
    const file = event.dataTransfer.files[0];
    const filePath = file ? (file as File & { path?: string }).path : undefined;
    if (!filePath) {
      toast.error('Drop a folder from your file system.');
      return;
    }
    void openDropped(filePath);
  };

  const openIntroduction = () => {
    void window.cortex.system.openExternal({ url: INTRO_URL });
  };

  const onRecentListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    if (!visibleRecents.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = Math.min(visibleRecents.length - 1, focusedRow + 1);
      setFocusedRow(next);
      rowRefs.current[next]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.max(0, focusedRow - 1);
      setFocusedRow(next);
      rowRefs.current[next]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      setFocusedRow(0);
      rowRefs.current[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      const last = visibleRecents.length - 1;
      setFocusedRow(last);
      rowRefs.current[last]?.focus();
    }
  };

  const projectDialog = (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="ghost launchpad-quiet-action">
          <FolderPlus aria-hidden="true" />
          Create project
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="dialog-title">
            <div>
              <Dialog.Title>Create a Cortex project</Dialog.Title>
              <Dialog.Description>
                Name the project and choose its primary resource type. Cortex will ask for a local
                parent folder next.
              </Dialog.Description>
            </div>
            <Dialog.Close type="button" aria-label="Close create project dialog">
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>
          <form onSubmit={(event) => void submit(event)}>
            <label>
              Project name
              <input
                autoComplete="off"
                placeholder="Downtown vehicle pack…"
                {...register('name')}
                aria-invalid={Boolean(errors.name)}
              />
            </label>
            {errors.name && <p className="field-error">{errors.name.message}</p>}
            <label>
              Resource type
              <select {...register('type')}>
                <option value="script">Script resource</option>
                <option value="vehicle">Vehicle</option>
                <option value="clothing">Clothing</option>
                <option value="prop">Prop</option>
                <option value="weapon">Weapon</option>
                <option value="mixed">Mixed resource</option>
              </select>
            </label>
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button type="button">Cancel</button>
              </Dialog.Close>
              <button type="submit" className="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Creating…' : 'Choose location…'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );

  const stateMotionProps = stateMotion(reduced, motionDurations.fast);
  const dropOverlayMotion = panelRevealMotion(reduced, motionDurations.fast);

  const renderWorkspaceRow = (item: RecentWorkspaceDetail, index: number, missing = false) => {
    const Icon = workspaceIcon(item.kind, item.hasManifest);
    const state = missing
      ? ({ label: 'Unavailable', tone: 'error' } satisfies WorkspaceState)
      : resolveWorkspaceState(item);
    const menuItems = missing
      ? [
          {
            id: 'locate',
            label: 'Locate',
            icon: FolderOpen,
            onSelect: () => void openFolder(),
          },
          {
            id: 'copy',
            label: 'Copy path',
            icon: Copy,
            separator: true,
            onSelect: () => {
              void copyText(item.root).then((ok) => {
                if (ok) toast.success('Path copied');
                else toast.error('Could not copy path');
              });
            },
          },
          {
            id: 'remove',
            label: 'Remove from recents',
            icon: Trash2,
            danger: true,
            separator: true,
            onSelect: () => void removeRecent(item.root),
          },
        ]
      : workspaceMenuItems(
          item,
          (root) => void openWorkspace(root),
          (root) => void removeRecent(root),
        );

    return (
      <li
        key={missing ? `missing-${item.root}` : item.root}
        className={missing ? 'is-missing' : undefined}
      >
        <div className="launchpad-ws-row">
          <button
            ref={(node) => {
              rowRefs.current[index] = node;
            }}
            type="button"
            className="launchpad-ws-hit"
            disabled={missing}
            tabIndex={focusedRow === index || (focusedRow === -1 && index === 0) ? 0 : -1}
            onFocus={() => setFocusedRow(index)}
            onClick={() => {
              if (!missing) void openWorkspace(item.root);
            }}
          >
            <span className="launchpad-ws-icon" aria-hidden="true">
              <Icon />
            </span>
            <span className="launchpad-ws-body">
              <span className="launchpad-ws-name">{item.name}</span>
              <span className="launchpad-ws-meta">
                {missing ? (
                  <span>Unavailable</span>
                ) : (
                  <span>{kindLabel(item.kind, item.projectType, item.hasManifest)}</span>
                )}
                <span aria-hidden="true">·</span>
                <span>Opened {formatRelativeTime(item.openedAt) ?? 'recently'}</span>
              </span>
              <code className="launchpad-ws-path" title={item.root}>
                {middleTruncatePath(item.root)}
              </code>
            </span>
            <span className={`launchpad-ws-state is-${state.tone}`}>{state.label}</span>
          </button>
          {missing ? (
            <button type="button" className="launchpad-ws-action" onClick={() => void openFolder()}>
              Locate
            </button>
          ) : (
            <button
              type="button"
              className="launchpad-ws-action"
              onClick={(event) => {
                event.stopPropagation();
                void openWorkspace(item.root);
              }}
            >
              Open
            </button>
          )}
          <OverflowMenu label={`More actions for ${item.name}`} items={menuItems} />
        </div>
      </li>
    );
  };

  return (
    <div
      className={`launchpad workbench-page page-scroll${isDragging ? ' is-drop-target' : ''}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDragging ? (
          <m.div
            key="drop-overlay"
            className="launchpad-drop-overlay"
            role="status"
            aria-live="polite"
            {...dropOverlayMotion}
          >
            <div className="launchpad-drop-overlay-inner">
              <FolderOpen aria-hidden="true" />
              <strong>Drop folder to open workspace</strong>
              <span>Cortex will index the resource locally on your machine.</span>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>

      <div className="launchpad-canvas">
        <div className="launchpad-grid workbench-grid">
          {isFirstRun ? (
            <section className="launchpad-hero span-12" aria-labelledby="launchpad-first-run-title">
              <h1 id="launchpad-first-run-title" className="launchpad-hero-title">
                Open your first workspace
              </h1>
              <p className="launchpad-hero-copy">
                Choose a project folder and Cortex will detect its structure, supported tools, and
                recommended next steps.
              </p>
              <div className="launchpad-hero-actions">
                <button type="button" className="primary" onClick={() => void openFolder()}>
                  <FolderOpen aria-hidden="true" />
                  Open a folder
                </button>
              </div>
              <div className="launchpad-first-run-links">
                <button
                  type="button"
                  className="launchpad-inline-link"
                  onClick={() => {
                    reset({ name: 'example-resource', type: 'script' });
                    setDialogOpen(true);
                  }}
                >
                  Create an example workspace
                </button>
                <span aria-hidden="true">·</span>
                <button type="button" className="launchpad-inline-link" onClick={openIntroduction}>
                  Read the quick introduction
                </button>
              </div>
              <p className="launchpad-drop-hint">Or drop a folder anywhere on this page</p>
            </section>
          ) : (
            <>
              <section
                className={`launchpad-hero ${continueWorkspace ? 'span-7' : 'span-12'}`}
                aria-labelledby="launchpad-start-title"
              >
                <h1 id="launchpad-start-title" className="launchpad-hero-title">
                  Start with a workspace
                </h1>
                <p className="launchpad-hero-copy">
                  Open an existing project, create a resource, or drop a folder into Cortex. Your
                  files remain local.
                </p>
                <div className="launchpad-hero-actions">
                  <button type="button" className="primary" onClick={() => void openFolder()}>
                    <FolderOpen aria-hidden="true" />
                    Open workspace
                  </button>
                  <div className="launchpad-secondary-actions">
                    {projectDialog}
                    <button
                      type="button"
                      className="ghost launchpad-quiet-action"
                      onClick={() => void importResource()}
                    >
                      <Upload aria-hidden="true" />
                      Import resource
                    </button>
                  </div>
                </div>
                <p className="launchpad-drop-hint">Or drop a folder anywhere on this page</p>
              </section>

              {continueWorkspace ? (
                <aside
                  className="launchpad-continue span-5"
                  aria-labelledby="launchpad-continue-title"
                >
                  <h2 id="launchpad-continue-title" className="launchpad-zone-label">
                    Continue where you left off
                  </h2>
                  <div className="launchpad-continue-body">
                    <p className="launchpad-continue-name">{continueWorkspace.name}</p>
                    <p className="launchpad-continue-meta">
                      {kindLabel(
                        continueWorkspace.kind,
                        continueWorkspace.projectType,
                        continueWorkspace.hasManifest,
                      )}
                      <span aria-hidden="true"> · </span>
                      Opened {formatRelativeTime(continueWorkspace.openedAt) ?? 'recently'}
                    </p>
                    {(continueActivity ?? loneActivity) ? (
                      <p className="launchpad-continue-activity">
                        {continueActivity
                          ? `${TOOL_META[continueActivity.tool].label} ${continueActivity.summary}`
                          : loneActivity
                            ? activitySentence(loneActivity)
                            : null}
                      </p>
                    ) : null}
                    <p className="launchpad-continue-health">
                      {continueHealthLine(continueWorkspace)}
                    </p>
                    <button
                      type="button"
                      className="primary launchpad-continue-action"
                      onClick={() => void openWorkspace(continueWorkspace.root)}
                    >
                      Resume workspace
                    </button>
                    {showContextual ? (
                      <button
                        type="button"
                        className="launchpad-contextual-link"
                        onClick={contextual.onAction}
                      >
                        {ContextualIcon ? <ContextualIcon aria-hidden="true" /> : null}
                        {contextual.title}
                        <ArrowRight aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </aside>
              ) : null}

              <section className="launchpad-zone span-12" aria-labelledby="launchpad-recents-title">
                <header className="launchpad-zone-head">
                  <h2 id="launchpad-recents-title" className="launchpad-zone-label">
                    Recent workspaces
                  </h2>
                  {showRecentControls ? (
                    <div className="launchpad-zone-tools">
                      <label className="launchpad-search">
                        <Search aria-hidden="true" />
                        <span className="sr-only">Search recent workspaces</span>
                        <input
                          type="search"
                          value={recentQuery}
                          placeholder="Search"
                          onChange={(event) => setRecentQuery(event.target.value)}
                        />
                      </label>
                      {!showAllRecents && filteredRecents.length > VISIBLE_RECENTS_DEFAULT ? (
                        <button
                          type="button"
                          className="launchpad-inline-link"
                          onClick={() => setShowAllRecents(true)}
                        >
                          View all
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </header>

                <AnimatePresence mode="wait" initial={false}>
                  {recents.isPending ? (
                    <m.p
                      key="pending"
                      className="launchpad-empty"
                      role="status"
                      {...stateMotionProps}
                    >
                      <Clock3 aria-hidden="true" />
                      Loading recents…
                    </m.p>
                  ) : visibleRecents.length === 0 && visibleMissing.length === 0 ? (
                    <m.p key="empty" className="launchpad-empty" {...stateMotionProps}>
                      Open a workspace to populate recents.
                    </m.p>
                  ) : (
                    <m.ul
                      key="recents"
                      className="launchpad-ws-list"
                      role="listbox"
                      aria-label="Recent workspaces"
                      onKeyDown={onRecentListKeyDown}
                      {...stateMotionProps}
                    >
                      {visibleRecents.map((item, index) => renderWorkspaceRow(item, index))}
                      {visibleMissing.map((item, offset) =>
                        renderWorkspaceRow(item, visibleRecents.length + offset, true),
                      )}
                    </m.ul>
                  )}
                </AnimatePresence>

                {hiddenMissingCount > 0 ? (
                  <p className="launchpad-footnote">
                    {hiddenMissingCount} more unavailable workspace
                    {hiddenMissingCount === 1 ? '' : 's'} hidden.
                  </p>
                ) : null}
              </section>

              {showActivitySection ? (
                <section
                  className="launchpad-zone span-12"
                  aria-labelledby="launchpad-activity-title"
                >
                  <h2 id="launchpad-activity-title" className="launchpad-zone-label">
                    Recent activity
                  </h2>
                  <ul className="launchpad-timeline">
                    {timelineActivities.slice(0, 8).map((entry) => {
                      const meta = TOOL_META[entry.tool];
                      const Icon = meta.icon;
                      return (
                        <li key={entry.id}>
                          <button
                            type="button"
                            className={`launchpad-timeline-row is-${entry.status}`}
                            onClick={() => void openActivity(entry)}
                          >
                            <span className={`launchpad-timeline-icon is-${entry.status}`}>
                              <Icon aria-hidden="true" />
                            </span>
                            <span className="launchpad-timeline-copy">
                              <span className="launchpad-timeline-action">
                                {meta.label} {entry.summary}
                              </span>
                              <span className="launchpad-timeline-meta">
                                {entry.workspaceName || 'Workspace'}
                                <span aria-hidden="true"> · </span>
                                {formatRelativeTime(entry.at) ?? 'recently'}
                              </span>
                            </span>
                            <span className={`launchpad-timeline-status is-${entry.status}`}>
                              {statusIcon(entry.status)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
