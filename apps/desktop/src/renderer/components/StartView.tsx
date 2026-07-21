import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileCode2,
  FolderOpen,
  MoreHorizontal,
  Package,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { listActivities, type ActivityEntry, type ActivityTool } from '../lib/activity-history';
import { copyText } from '../lib/clipboard';
import {
  collapsiblePanelMotion,
  panelRevealMotion,
  useReducedMotion,
  type FolderNavDirection,
} from '../lib/motion';
import { formatRelativeTime } from '../lib/relative-time';
import { formatBytes, unwrap } from '../lib/result';
import { MODULE_ICONS } from '../modules/registry';
import {
  useWorkspaceStore,
  type EditorTab,
  type SessionAnalysis,
  type SessionPackagePreview,
  type SessionValidation,
} from '../store/workspace';
import { ContextMenu } from './ContextMenu';
import { HomeModuleHub } from './HomeModuleHub';
import { SectionPageHost } from './SectionPageHost';

type NextTone = 'neutral' | 'attention' | 'ready' | 'blocked';

interface PrimaryStatus {
  eyebrow: string;
  tone: NextTone;
  title: string;
  reason: string;
  whyNow: string;
  cta: string;
  kind: EditorTab['kind'] | null;
  tabLabel: string;
  icon: LucideIcon;
  onAction?: () => void;
}

type StageState = 'complete' | 'attention' | 'idle' | 'skipped' | 'blocked' | 'waiting';
type StageEmphasis = 'current' | 'quiet' | 'default';

interface WorkflowStage {
  id: string;
  label: string;
  state: StageState;
  emphasis: StageEmphasis;
  status: string;
  result: string;
  action: string | null;
  kind: EditorTab['kind'] | null;
  tabLabel: string;
}

interface WorkspaceState {
  label: string;
  tone: 'ready' | 'attention' | 'neutral' | 'blocked';
}

type FindingSeverity = 'error' | 'warning' | 'info';

interface OverviewFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  tool: string;
  action: string;
  onAction: () => void;
}

const SCOPE_FORCE_PREFIX = 'cortex.workspaceScopeForce:';

function joinRootPath(root: string, relative: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  const base = root.replace(/[\\/]+$/, '');
  const sub = relative.replace(/^[\\/]+/, '').replace(/\//g, sep);
  return sub ? `${base}${sep}${sub}` : base;
}

function scopeForceKey(root: string): string {
  return `${SCOPE_FORCE_PREFIX}${root.replace(/[\\/]+$/, '').toLowerCase()}`;
}

function readScopeForced(root: string): boolean {
  try {
    return globalThis.localStorage.getItem(scopeForceKey(root)) === '1';
  } catch {
    return false;
  }
}

function writeScopeForced(root: string): void {
  try {
    globalThis.localStorage.setItem(scopeForceKey(root), '1');
  } catch {
    /* ignore */
  }
}

function formatSessionTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatAnalyzedTime(iso: string | undefined): string {
  if (!iso) return 'Not analyzed yet';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'Not analyzed yet';
  const deltaSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (deltaSec < 45) return 'Analyzed just now';
  if (deltaSec < 60) return `Analyzed ${deltaSec} seconds ago`;
  const mins = Math.round(deltaSec / 60);
  if (mins < 60) return `Analyzed ${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `Analyzed ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `Analyzed ${days} day${days === 1 ? '' : 's'} ago`;
}

function reviewLineLabel(count: number): string {
  if (count <= 0) return 'Clean';
  return count === 1 ? '1 line needs review' : `${count} lines need review`;
}

function declarationReviewLabel(count: number): string {
  return count === 1
    ? '1 declaration needs confirmation'
    : `${count} declarations need confirmation`;
}

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function truncatePath(value: string, max = 52): string {
  if (value.length <= max) return value;
  return `…${value.slice(-(max - 1))}`;
}

function confidenceLabel(confidence: 'high' | 'medium' | 'low'): string | null {
  if (confidence === 'high') return null;
  return confidence === 'medium' ? 'Medium confidence' : 'Low confidence';
}

function resolveWorkspaceState(input: {
  scopeBlocked: boolean;
  hasManifest: boolean;
  missingCount: number;
  unsupportedCount: number;
  lastValidation: SessionValidation | null;
  lastPackagePreview: SessionPackagePreview | null;
  packageBlocked: boolean;
}): WorkspaceState {
  if (input.scopeBlocked) {
    return { label: 'Scope needs resolution', tone: 'attention' };
  }
  if (!input.hasManifest) {
    return { label: 'Manifest missing', tone: 'attention' };
  }
  if (input.missingCount > 0) {
    return { label: 'Manifest incomplete', tone: 'attention' };
  }
  if (input.lastValidation && input.lastValidation.errorCount > 0) {
    const n = input.lastValidation.errorCount;
    return {
      label: `${n} validation error${n === 1 ? '' : 's'}`,
      tone: 'attention',
    };
  }
  if (input.packageBlocked) {
    return { label: 'Packaging blocked', tone: 'blocked' };
  }
  if (!input.lastValidation) {
    return { label: 'Ready for validation', tone: 'neutral' };
  }
  if (input.unsupportedCount > 0) {
    return { label: 'Manifest needs review', tone: 'neutral' };
  }
  if (input.lastPackagePreview) {
    return { label: 'Ready to bundle', tone: 'ready' };
  }
  if (input.lastValidation.warningCount > 0) {
    return { label: 'Validation warnings', tone: 'neutral' };
  }
  return { label: 'Validation passed', tone: 'ready' };
}

function resolvePrimaryStatus(input: {
  scopeBlocked: boolean;
  detectionMessage: string | null;
  hasManifest: boolean;
  missingCount: number;
  unsupportedCount: number;
  lastValidation: SessionValidation | null;
  lastPackagePreview: SessionPackagePreview | null;
  lastAnalysis: SessionAnalysis | null;
  scripts: number;
  packageBlocked: boolean;
  onChooseResource: () => void;
}): PrimaryStatus {
  if (input.scopeBlocked) {
    return {
      eyebrow: 'Needs attention',
      tone: 'attention',
      title: 'Multiple resource roots detected',
      reason:
        input.detectionMessage ??
        'Choose which resource Cortex should inspect before validating or packaging.',
      whyNow: 'Workspace scope is ambiguous until you pick a resource root.',
      cta: 'Choose resource',
      kind: null,
      tabLabel: '',
      icon: FolderOpen,
      onAction: input.onChooseResource,
    };
  }

  if (!input.hasManifest) {
    return {
      eyebrow: 'Needs attention',
      tone: 'attention',
      title: 'Review manifest setup',
      reason:
        'Create or open fxmanifest.lua before validating paths or building a release package.',
      whyNow: 'No resource manifest was found at the workspace root.',
      cta: 'Open Index',
      kind: 'index',
      tabLabel: 'Index',
      icon: FileCode2,
    };
  }

  if (input.unsupportedCount > 0 && input.missingCount === 0) {
    return {
      eyebrow: 'Recommended next step',
      tone: 'neutral',
      title: 'Review manifest declarations',
      reason: 'Confirm parser warnings before running validation or packaging.',
      whyNow: `${input.unsupportedCount} manifest line${input.unsupportedCount === 1 ? '' : 's'} need manual confirmation.`,
      cta: 'Review in Index',
      kind: 'index',
      tabLabel: 'Index',
      icon: FileCode2,
    };
  }

  if (input.missingCount > 0) {
    return {
      eyebrow: 'Needs attention',
      tone: 'attention',
      title: `${input.missingCount} declared path${input.missingCount === 1 ? '' : 's'} ${input.missingCount === 1 ? 'is' : 'are'} missing`,
      reason: 'Resolve manifest paths before validating or packaging.',
      whyNow: 'Sentinel cannot validate paths that are not on disk.',
      cta: 'Review missing paths',
      kind: 'index',
      tabLabel: 'Index',
      icon: FileCode2,
    };
  }

  if (input.lastValidation && input.lastValidation.errorCount > 0) {
    const errors = input.lastValidation.errorCount;
    return {
      eyebrow: 'Needs attention',
      tone: 'attention',
      title: `Resolve ${errors} blocking finding${errors === 1 ? '' : 's'}`,
      reason: 'Fix Sentinel errors before previewing or exporting a package.',
      whyNow: 'Validation reported errors during this workspace session.',
      cta: 'Open Sentinel',
      kind: 'sentinel',
      tabLabel: 'Sentinel validation',
      icon: ShieldCheck,
    };
  }

  if (input.packageBlocked) {
    return {
      eyebrow: 'Needs attention',
      tone: 'blocked',
      title: 'Packaging is blocked',
      reason: 'Resolve validation and manifest issues before building a release archive.',
      whyNow: 'Bundle requires a clean manifest and passing validation.',
      cta: 'Resolve issues',
      kind: 'sentinel',
      tabLabel: 'Sentinel validation',
      icon: ShieldCheck,
    };
  }

  if (!input.lastValidation) {
    return {
      eyebrow: 'Recommended next step',
      tone: 'neutral',
      title: 'Validate this resource',
      reason: 'Check declared paths, package hygiene, and release risks before packaging.',
      whyNow: 'Sentinel has not run since the workspace was opened.',
      cta: 'Run Sentinel',
      kind: 'sentinel',
      tabLabel: 'Sentinel validation',
      icon: ShieldCheck,
    };
  }

  if (input.lastValidation.warningCount > 0) {
    return {
      eyebrow: 'Recommended next step',
      tone: 'neutral',
      title: 'Review validation warnings',
      reason: 'Address Sentinel warnings before exporting a release package.',
      whyNow: `${input.lastValidation.warningCount} warning${input.lastValidation.warningCount === 1 ? '' : 's'} reported this session.`,
      cta: 'Open Sentinel',
      kind: 'sentinel',
      tabLabel: 'Sentinel validation',
      icon: ShieldCheck,
    };
  }

  if (input.scripts > 0 && !input.lastAnalysis) {
    return {
      eyebrow: 'Recommended next step',
      tone: 'neutral',
      title: 'Map script contracts',
      reason: 'Index events, exports, and commands before packaging.',
      whyNow: 'Wire has not mapped interfaces for this workspace yet.',
      cta: 'Open Wire',
      kind: 'wire',
      tabLabel: 'Wire',
      icon: MODULE_ICONS.wire,
    };
  }

  if (!input.lastPackagePreview) {
    return {
      eyebrow: 'Recommended next step',
      tone: 'neutral',
      title: 'Preview the release package',
      reason: 'Confirm the exact ZIP contents before export.',
      whyNow: 'Validation passed and the workspace is ready for packaging.',
      cta: 'Open Bundle',
      kind: 'bundle',
      tabLabel: 'Bundle',
      icon: Package,
    };
  }

  return {
    eyebrow: 'Release status',
    tone: 'ready',
    title: 'Ready to bundle',
    reason: `${input.lastPackagePreview.fileCount} file${input.lastPackagePreview.fileCount === 1 ? '' : 's'} staged for export.`,
    whyNow: 'Package preview is current for this workspace session.',
    cta: 'Open Bundle',
    kind: 'bundle',
    tabLabel: 'Bundle',
    icon: Package,
  };
}

function buildWorkflowStages(input: {
  hasManifest: boolean;
  missingCount: number;
  unsupportedCount: number;
  manifestName: string | null;
  lastValidation: SessionValidation | null;
  lastAnalysis: SessionAnalysis | null;
  lastPackagePreview: SessionPackagePreview | null;
  scripts: number;
  scopeBlocked: boolean;
  primaryKind: EditorTab['kind'] | null;
}): WorkflowStage[] {
  const manifestNeedsReview = input.unsupportedCount > 0 && input.missingCount === 0;
  const manifestState: StageState = !input.hasManifest
    ? 'attention'
    : input.missingCount > 0
      ? 'attention'
      : 'complete';

  const validationState: StageState = input.lastValidation
    ? input.lastValidation.errorCount > 0
      ? 'attention'
      : 'complete'
    : 'idle';

  const analysisState: StageState =
    input.scripts === 0 ? 'skipped' : input.lastAnalysis ? 'complete' : 'idle';

  const packageBlocked =
    input.scopeBlocked ||
    !input.hasManifest ||
    input.missingCount > 0 ||
    Boolean(input.lastValidation && input.lastValidation.errorCount > 0);

  const packageState: StageState = packageBlocked
    ? 'waiting'
    : input.lastPackagePreview
      ? 'complete'
      : 'waiting';

  const stages: WorkflowStage[] = [
    {
      id: 'manifest',
      label: 'Manifest',
      state: manifestState,
      emphasis: 'default',
      status: !input.hasManifest
        ? 'Missing'
        : input.missingCount > 0
          ? 'Incomplete'
          : manifestNeedsReview
            ? 'Ready with review'
            : 'Ready',
      result: !input.hasManifest
        ? 'No fxmanifest.lua at root'
        : input.missingCount > 0
          ? `${input.missingCount} missing path${input.missingCount === 1 ? '' : 's'}`
          : manifestNeedsReview
            ? declarationReviewLabel(input.unsupportedCount)
            : 'Declarations confirmed',
      action: !input.hasManifest ? 'Create manifest' : 'Open Index',
      kind: 'index',
      tabLabel: 'Index',
    },
    {
      id: 'validation',
      label: 'Validation',
      state: validationState,
      emphasis: 'default',
      status: input.lastValidation
        ? input.lastValidation.errorCount > 0
          ? 'Issues found'
          : 'Complete'
        : 'Ready to run',
      result: input.lastValidation
        ? input.lastValidation.errorCount > 0
          ? `${input.lastValidation.errorCount} error${input.lastValidation.errorCount === 1 ? '' : 's'} · ${input.lastValidation.warningCount} warning${input.lastValidation.warningCount === 1 ? '' : 's'}`
          : input.lastValidation.warningCount > 0
            ? `${input.lastValidation.warningCount} warning${input.lastValidation.warningCount === 1 ? '' : 's'}`
            : 'No blocking issues'
        : 'Not run this session',
      action: input.lastValidation ? 'Open Sentinel' : 'Run Sentinel',
      kind: 'sentinel',
      tabLabel: 'Sentinel validation',
    },
    {
      id: 'analysis',
      label: 'Analysis',
      state: analysisState,
      emphasis: 'default',
      status: input.scripts === 0 ? 'Skipped' : input.lastAnalysis ? 'Complete' : 'Not run',
      result:
        input.scripts === 0
          ? 'No scripts in workspace'
          : input.lastAnalysis
            ? `${input.lastAnalysis.scripts} script${input.lastAnalysis.scripts === 1 ? '' : 's'} indexed`
            : 'Probe has not run this session',
      action: input.scripts === 0 ? null : input.lastAnalysis ? 'Review in Probe' : 'Open Probe',
      kind: 'probe',
      tabLabel: 'Probe',
    },
    {
      id: 'package',
      label: 'Package',
      state: packageState,
      emphasis: 'default',
      status: packageBlocked ? 'Waiting' : input.lastPackagePreview ? 'Ready' : 'Waiting',
      result: input.lastPackagePreview
        ? `${input.lastPackagePreview.fileCount} file${input.lastPackagePreview.fileCount === 1 ? '' : 's'} in preview`
        : packageBlocked
          ? !input.lastValidation
            ? 'Run validation first'
            : 'Resolve blocking issues first'
          : 'Preview not started',
      action: packageBlocked
        ? input.lastValidation
          ? 'Open Sentinel'
          : 'Run Sentinel'
        : input.lastPackagePreview
          ? 'Open Bundle'
          : 'Preview package',
      kind: packageBlocked ? 'sentinel' : 'bundle',
      tabLabel: packageBlocked ? 'Sentinel validation' : 'Bundle',
    },
  ];

  const currentId =
    input.primaryKind === 'index'
      ? 'manifest'
      : input.primaryKind === 'sentinel'
        ? 'validation'
        : input.primaryKind === 'probe' || input.primaryKind === 'wire'
          ? 'analysis'
          : input.primaryKind === 'bundle'
            ? 'package'
            : null;

  return stages.map((stage) => {
    let emphasis: StageEmphasis = 'default';
    if (stage.state === 'complete' || stage.state === 'skipped') {
      emphasis = 'quiet';
    }
    if (stage.id === currentId) {
      emphasis = 'current';
    }
    return { ...stage, emphasis };
  });
}

const NEUTRAL_SIGNAL_IDS = new Set(['nui', 'deps', 'flat-layout']);

function buildFindings(input: {
  signals: { id: string; severity: FindingSeverity; text: string }[];
  manifest: {
    missing: string[];
    missingCount: number;
    unsupportedCount: number;
  } | null;
  hasManifest: boolean;
  scopeBlocked: boolean;
  largest: { path: string; bytes: number }[];
  lastValidation: SessionValidation | null;
  onGo: (kind: EditorTab['kind'], label: string) => void;
  onReveal: (relativePath: string) => void;
}): OverviewFinding[] {
  const findings: OverviewFinding[] = [];

  if (!input.scopeBlocked && input.manifest && input.manifest.missingCount > 0) {
    const examples = input.manifest.missing.slice(0, 2);
    const remainder = input.manifest.missingCount - examples.length;
    findings.push({
      id: 'missing-paths',
      severity: 'error',
      title: `${input.manifest.missingCount} declared path${input.manifest.missingCount === 1 ? '' : 's'} missing`,
      detail:
        remainder > 0
          ? `${examples.map((entry) => truncatePath(entry, 36)).join(' · ')} · +${remainder} more`
          : examples.map((entry) => truncatePath(entry, 36)).join(' · '),
      tool: 'Index',
      action: 'Review paths',
      onAction: () => input.onGo('index', 'Index'),
    });
  }

  if (!input.scopeBlocked && input.manifest && input.manifest.unsupportedCount > 0) {
    findings.push({
      id: 'unsupported-manifest',
      severity: 'warning',
      title: 'Manifest lines need manual review',
      detail: `${input.manifest.unsupportedCount} declaration${input.manifest.unsupportedCount === 1 ? '' : 's'} were not fully interpreted.`,
      tool: 'Index',
      action: 'Open Index',
      onAction: () => input.onGo('index', 'Index'),
    });
  }

  if (!input.scopeBlocked && !input.hasManifest) {
    findings.push({
      id: 'no-manifest',
      severity: 'error',
      title: 'No resource manifest at workspace root',
      detail: 'Packaging and validation require fxmanifest.lua or __resource.lua.',
      tool: 'Index',
      action: 'Create manifest',
      onAction: () => input.onGo('index', 'Index'),
    });
  }

  for (const signal of input.signals) {
    if (
      signal.id === 'missing-refs' ||
      signal.id === 'no-manifest' ||
      signal.id === 'unsupported'
    ) {
      continue;
    }
    if (NEUTRAL_SIGNAL_IDS.has(signal.id)) continue;
    if (signal.id === 'large-file' && input.largest[0]) {
      const entry = input.largest[0];
      findings.push({
        id: signal.id,
        severity: 'warning',
        title: `Unusually large file (${formatBytes(entry.bytes)})`,
        detail: `May slow packaging and review — ${truncatePath(entry.path)}`,
        tool: 'Workspace',
        action: 'Reveal file',
        onAction: () => input.onReveal(entry.path),
      });
      continue;
    }
    if (signal.id === 'empty-payload') {
      findings.push({
        id: signal.id,
        severity: 'warning',
        title: 'Manifest has no declared payload',
        detail: 'No scripts, models, or textures are declared or found.',
        tool: 'Index',
        action: 'Open Index',
        onAction: () => input.onGo('index', 'Index'),
      });
    }
  }

  if (input.lastValidation && input.lastValidation.errorCount > 0) {
    findings.push({
      id: 'validation-errors',
      severity: 'error',
      title: `${input.lastValidation.errorCount} validation error${input.lastValidation.errorCount === 1 ? '' : 's'}`,
      detail: `${input.lastValidation.warningCount} warning${input.lastValidation.warningCount === 1 ? '' : 's'} also reported this session.`,
      tool: 'Sentinel',
      action: 'Open Sentinel',
      onAction: () => input.onGo('sentinel', 'Sentinel validation'),
    });
  }

  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (seen.has(finding.id)) return false;
    seen.add(finding.id);
    return true;
  });
}

function buildTopFindings(input: {
  lastValidation: SessionValidation | null;
  onGo: (kind: EditorTab['kind'], label: string) => void;
}): OverviewFinding[] {
  if (!input.lastValidation) return [];
  if (input.lastValidation.errorCount > 0) return [];
  if (input.lastValidation.warningCount <= 0) return [];
  const warnings = input.lastValidation.warningCount;
  return [
    {
      id: 'validation-warnings',
      severity: 'warning',
      title: `${warnings} validation warning${warnings === 1 ? '' : 's'}`,
      detail: 'Review before packaging — no blocking errors reported.',
      tool: 'Sentinel',
      action: 'Review warnings',
      onAction: () => input.onGo('sentinel', 'Sentinel validation'),
    },
  ];
}

const ACTIVITY_TOOL_META: Record<
  ActivityTool,
  { label: string; icon: LucideIcon; moduleKind: EditorTab['kind'] }
> = {
  probe: { label: 'Probe', icon: MODULE_ICONS.probe, moduleKind: 'probe' },
  sentinel: { label: 'Sentinel', icon: MODULE_ICONS.sentinel, moduleKind: 'sentinel' },
  bundle: { label: 'Bundle', icon: MODULE_ICONS.bundle, moduleKind: 'bundle' },
  wire: { label: 'Wire', icon: MODULE_ICONS.wire, moduleKind: 'wire' },
  chassis: { label: 'Chassis', icon: MODULE_ICONS.chassis, moduleKind: 'chassis' },
};

function formatActivityDisplay(entry: ActivityEntry): { action: string; result: string } {
  const meta = ACTIVITY_TOOL_META[entry.tool];
  if (!meta) {
    return { action: 'Workspace activity', result: entry.summary };
  }
  if (entry.tool === 'wire') {
    const match = entry.summary.match(/(\d+) events.*?(\d+) exports.*?(\d+) commands/);
    if (match) {
      return {
        action: 'Wire mapped',
        result: `${match[1]} events, ${match[2]} exports, and ${match[3]} commands`,
      };
    }
  }
  if (entry.tool === 'sentinel') {
    if (entry.status === 'warning') {
      const warnMatch = entry.summary.match(/(\d+) warning/);
      const count = warnMatch?.[1] ?? entry.summary;
      return {
        action: 'Sentinel completed',
        result: `with ${count} warning${count === '1' ? '' : 's'}`,
      };
    }
    if (entry.status === 'error') {
      return { action: 'Sentinel completed', result: `with ${entry.summary}` };
    }
    return { action: 'Sentinel completed', result: 'with no blocking issues' };
  }
  if (entry.tool === 'probe') {
    return { action: 'Probe analyzed', result: entry.summary };
  }
  return { action: meta.label, result: entry.summary };
}

function severityLabel(severity: FindingSeverity): string {
  if (severity === 'error') return 'Error';
  if (severity === 'warning') return 'Warning';
  return 'Info';
}

function BriefSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="brief-skeleton" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

function WorkspaceBriefPanel(): React.JSX.Element | null {
  const reduced = useReducedMotion();
  const detailsMotion = collapsiblePanelMotion(reduced);
  const scopeMotion = panelRevealMotion(reduced);
  const queryClient = useQueryClient();
  const workspace = useWorkspaceStore((state) => state.workspace);
  const files = useWorkspaceStore((state) => state.files);
  const setWorkspace = useWorkspaceStore((state) => state.setWorkspace);
  const closeWorkspace = useWorkspaceStore((state) => state.closeWorkspace);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const lastValidation = useWorkspaceStore((state) => state.lastValidation);
  const lastPackagePreview = useWorkspaceStore((state) => state.lastPackagePreview);
  const lastAnalysis = useWorkspaceStore((state) => state.lastAnalysis);
  const setLastAnalysis = useWorkspaceStore((state) => state.setLastAnalysis);
  const [scopeForced, setScopeForced] = useState(() =>
    workspace ? readScopeForced(workspace.root) : false,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [scopeFocus, setScopeFocus] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  const summary = useQuery({
    queryKey: ['summary', workspace?.root],
    queryFn: async () => unwrap(await window.cortex.resources.summary()),
    enabled: Boolean(workspace),
  });
  const analysis = useQuery({
    queryKey: ['analysis', workspace?.root],
    queryFn: async () => unwrap(await window.cortex.resources.analyze()),
    enabled: Boolean(workspace) && (summary.data?.scripts ?? 0) > 0,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!analysis.data) return;
    setLastAnalysis({
      at: analysis.data.generatedAt,
      scripts: analysis.data.summary.scripts,
      lines: analysis.data.summary.lines,
      events: analysis.data.summary.events,
      exports: analysis.data.summary.exports,
      commands: analysis.data.summary.commands,
    });
  }, [analysis.data, setLastAnalysis]);

  useEffect(() => {
    if (!workspace) return;
    setScopeForced(readScopeForced(workspace.root));
  }, [workspace?.root]);

  const openFolder = async () => {
    try {
      const result = unwrap(await window.cortex.projects.open());
      if (result) setWorkspace(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cortex could not open that folder.');
    }
  };

  const openResourceRoot = async (directory: string) => {
    if (!workspace) return;
    try {
      const result = unwrap(
        await window.cortex.projects.openFolder({ root: joinRootPath(workspace.root, directory) }),
      );
      setWorkspace(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cortex could not open that resource.');
    }
  };

  const go = (kind: EditorTab['kind'], label: string) =>
    openTab({
      id: kind,
      label,
      relativePath: kind === 'index' ? (workspace?.manifestName ?? 'fxmanifest.lua') : null,
      kind,
      dirty: false,
    });

  const revealPath = (relativePath: string) => {
    if (!workspace) return;
    void window.cortex.projects.reveal({ root: joinRootPath(workspace.root, relativePath) });
  };

  const topFolders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const file of files) {
      const parts = file.relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
      const root = parts.length > 1 ? (parts[0] ?? '(root)') : '(root)';
      counts.set(root, (counts.get(root) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }));
  }, [files]);

  const topSymbols = useMemo(() => {
    if (!analysis.data) return [];
    const counts = new Map<string, { name: string; kind: string; count: number }>();
    for (const file of analysis.data.files) {
      for (const symbol of file.symbols) {
        if (symbol.kind !== 'event' && symbol.kind !== 'export' && symbol.kind !== 'command')
          continue;
        const key = `${symbol.kind}:${symbol.name}`;
        const existing = counts.get(key);
        if (existing) existing.count += 1;
        else counts.set(key, { name: symbol.name, kind: symbol.kind, count: 1 });
      }
    }
    return [...counts.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 2);
  }, [analysis.data]);

  const recentActivity = useMemo(() => {
    if (!workspace) return [];
    const key = workspace.root.replace(/[\\/]+$/, '').toLowerCase();
    return listActivities()
      .filter((entry) => entry.workspaceRoot.replace(/[\\/]+$/, '').toLowerCase() === key)
      .slice(0, 3);
  }, [workspace?.root]);

  if (!workspace) return null;

  const name = workspace.project?.name ?? workspace.root.split(/[\\/]/).at(-1) ?? 'Workspace';
  const detection = summary.data?.detection;
  const scopeBlocked = detection?.scope === 'ambiguous' && !scopeForced;
  const hasManifest = Boolean(workspace.manifestName) && !scopeBlocked;
  const manifest = scopeBlocked ? null : (summary.data?.manifest ?? null);
  const missingCount = manifest?.missingCount ?? 0;
  const unsupportedCount = manifest?.unsupportedCount ?? 0;
  const scripts = summary.data?.scripts ?? 0;
  const surface = analysis.data?.summary;
  const totalFiles = summary.data?.files ?? 0;
  const textures = summary.data?.textures ?? 0;
  const models = summary.data?.models ?? 0;
  const metadata = summary.data?.metadata ?? 0;
  const other = Math.max(0, totalFiles - scripts - textures - models - metadata);
  const signals = summary.data?.signals ?? [];
  const largest = summary.data?.largest ?? [];
  const packageBlocked =
    !hasManifest || missingCount > 0 || Boolean(lastValidation && lastValidation.errorCount > 0);

  const primary = resolvePrimaryStatus({
    scopeBlocked,
    detectionMessage: detection?.message ?? null,
    hasManifest,
    missingCount,
    unsupportedCount,
    lastValidation,
    lastPackagePreview,
    lastAnalysis,
    scripts,
    packageBlocked,
    onChooseResource: () => setScopeFocus(true),
  });
  const PrimaryIcon = primary.icon;

  const workspaceState = resolveWorkspaceState({
    scopeBlocked,
    hasManifest,
    missingCount,
    unsupportedCount,
    lastValidation,
    lastPackagePreview,
    packageBlocked,
  });

  const workflow = buildWorkflowStages({
    hasManifest,
    missingCount,
    unsupportedCount,
    manifestName: workspace.manifestName,
    lastValidation,
    lastAnalysis,
    lastPackagePreview,
    scripts,
    scopeBlocked,
    primaryKind: primary.kind,
  });

  const findings = buildFindings({
    signals,
    manifest,
    hasManifest,
    scopeBlocked,
    largest,
    lastValidation,
    onGo: go,
    onReveal: revealPath,
  });

  const topFindings = buildTopFindings({ lastValidation, onGo: go });

  const attentionFindings = findings.slice(0, 3);
  const visibleTopFindings = topFindings.slice(0, 3);
  const compositionRows = [
    { label: 'Textures', count: textures, pct: percent(textures, totalFiles), tone: 'textures' },
    { label: 'Other', count: other, pct: percent(other, totalFiles), tone: 'other' },
    { label: 'Metadata', count: metadata, pct: percent(metadata, totalFiles), tone: 'metadata' },
    { label: 'Models', count: models, pct: percent(models, totalFiles), tone: 'models' },
    { label: 'Scripts', count: scripts, pct: percent(scripts, totalFiles), tone: 'scripts' },
  ]
    .filter((row) => row.count > 0)
    .sort((a, b) => b.pct - a.pct);

  const compositionLine = compositionRows.map((row) => `${row.label} ${row.pct}%`).join(' · ');
  const confidence = detection ? confidenceLabel(detection.confidence) : null;
  const projectType = detection?.projectType ?? 'Script resource';
  const eventCount = surface?.events ?? lastAnalysis?.events ?? 0;
  const exportCount = surface?.exports ?? lastAnalysis?.exports ?? 0;
  const commandCount = surface?.commands ?? lastAnalysis?.commands ?? 0;
  const runtimeLabel =
    manifest && [manifest.fxVersion, manifest.game].filter(Boolean).length > 0
      ? [manifest.fxVersion, manifest.game].filter(Boolean).join(' · ')
      : '—';

  const snapshotMetrics = [
    { label: 'Files', value: summary.isPending ? '…' : String(totalFiles) },
    {
      label: 'Total size',
      value: summary.data ? formatBytes(summary.data.bytes) : summary.isPending ? '…' : '—',
    },
    { label: 'Scripts', value: summary.isPending ? '…' : String(scripts) },
    { label: 'Events', value: String(eventCount) },
  ];

  const manifestStateLabel = !hasManifest
    ? 'Missing'
    : missingCount > 0
      ? 'Incomplete'
      : unsupportedCount > 0
        ? 'Needs review'
        : 'Ready';

  const reanalyzeWorkspace = async () => {
    if (!workspace || reanalyzing) return;
    setReanalyzing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['summary', workspace.root] });
      await queryClient.invalidateQueries({ queryKey: ['analysis', workspace.root] });
      await summary.refetch();
      if (scripts > 0) await analysis.refetch();
      toast.success('Workspace reanalyzed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reanalyze workspace');
    } finally {
      setReanalyzing(false);
    }
  };

  const handleForceScope = () => {
    writeScopeForced(workspace.root);
    setScopeForced(true);
    toast.message('Using this folder as the workspace scope.');
  };

  return (
    <div className="brief workbench-page page-scroll">
      <div className="brief-canvas">
        <header className="brief-header">
          <div className="brief-header-main">
            <div className="brief-header-top">
              <h1 className="brief-title">{name}</h1>
              <p className={`brief-workspace-state tone-${workspaceState.tone}`}>
                {workspaceState.label}
              </p>
            </div>
            <p className="brief-path-line">
              <code title={workspace.root}>{workspace.root}</code>
            </p>
            <p className="brief-header-meta">
              <span className="brief-type">{projectType}</span>
              <span className="brief-meta-sep" aria-hidden="true">
                ·
              </span>
              <span className="brief-analyzed">{formatAnalyzedTime(summary.data?.indexedAt)}</span>
              {confidence ? (
                <>
                  <span className="brief-meta-sep" aria-hidden="true">
                    ·
                  </span>
                  <span className="brief-confidence">{confidence}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="brief-header-actions">
            <button
              type="button"
              className="secondary brief-reveal-btn"
              onClick={() => void window.cortex.projects.reveal({ root: workspace.root })}
            >
              <ExternalLink aria-hidden="true" />
              Reveal
            </button>
            <ContextMenu
              label="Workspace actions"
              triggerOnClick
              items={[
                {
                  id: 'reveal',
                  label: 'Reveal in Explorer',
                  icon: ExternalLink,
                  onSelect: () => void window.cortex.projects.reveal({ root: workspace.root }),
                },
                {
                  id: 'copy-root',
                  label: 'Copy path',
                  icon: Copy,
                  onSelect: () => {
                    void copyText(workspace.root).then((ok) => {
                      if (ok) toast.success('Workspace path copied');
                      else toast.error('Could not copy path');
                    });
                  },
                },
                {
                  id: 'reanalyze',
                  label: 'Reanalyze workspace',
                  icon: RefreshCw,
                  onSelect: () => void reanalyzeWorkspace(),
                },
                {
                  id: 'switch',
                  label: 'Switch workspace',
                  icon: FolderOpen,
                  separator: true,
                  onSelect: () => void openFolder(),
                },
                {
                  id: 'close',
                  label: 'Close workspace',
                  icon: X,
                  danger: true,
                  onSelect: () => {
                    void closeWorkspace().then((ok) => {
                      if (!ok) toast.error('Could not close workspace');
                    });
                  },
                },
              ]}
            >
              <button type="button" className="brief-overflow" aria-label="Workspace actions">
                <MoreHorizontal aria-hidden="true" />
              </button>
            </ContextMenu>
          </div>
        </header>

        <section className="brief-stepper" aria-label="Workflow status">
          <ol className="brief-stepper-track">
            {workflow.map((stage, index) => (
              <li
                key={stage.id}
                className={`brief-stepper-stage is-${stage.state} emphasis-${stage.emphasis}${index === workflow.length - 1 ? ' is-last' : ''}`}
              >
                <div className="brief-stepper-rail" aria-hidden="true">
                  <span className="brief-stepper-node">
                    {stage.state === 'complete' ? (
                      <Check />
                    ) : stage.state === 'attention' ? (
                      <AlertTriangle />
                    ) : (
                      <span className="brief-stepper-dot" />
                    )}
                  </span>
                  {index < workflow.length - 1 ? (
                    <span className="brief-stepper-connector" />
                  ) : null}
                </div>
                <div className="brief-stepper-body">
                  <div className="brief-stepper-head">
                    <span className="brief-stepper-label">{stage.label}</span>
                    <span className="brief-stepper-status">{stage.status}</span>
                  </div>
                  <p className="brief-stepper-result">{stage.result}</p>
                  {stage.action && stage.kind && stage.emphasis !== 'quiet' ? (
                    <button
                      type="button"
                      className={`brief-stepper-action${stage.emphasis === 'current' ? ' is-primary' : ''}`}
                      onClick={() => go(stage.kind!, stage.tabLabel)}
                    >
                      {stage.action}
                      {stage.emphasis === 'current' ? <ArrowRight aria-hidden="true" /> : null}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section
          className={`brief-recommend tone-${primary.tone}`}
          aria-labelledby="brief-primary-title"
        >
          <div className="brief-recommend-copy">
            <span className="brief-recommend-eyebrow">{primary.eyebrow}</span>
            <h2 id="brief-primary-title">{primary.title}</h2>
            <p className="brief-recommend-reason">{primary.reason}</p>
            <p className="brief-recommend-why">
              <span className="brief-recommend-why-label">Why now:</span> {primary.whyNow}
            </p>
            <button
              type="button"
              className="primary brief-recommend-action"
              onClick={() => {
                if (primary.onAction) primary.onAction();
                else if (primary.kind) go(primary.kind, primary.tabLabel);
              }}
            >
              <PrimaryIcon aria-hidden="true" />
              {primary.cta}
            </button>
          </div>
        </section>

        {scopeBlocked && detection ? (
          <AnimatePresence mode="wait" initial={false}>
            <m.section
              key="brief-scope"
              className={`brief-scope${scopeFocus ? ' is-focused' : ''}`}
              aria-labelledby="brief-scope-title"
              {...scopeMotion}
            >
              <div className="brief-scope-copy">
                <h2 id="brief-scope-title">Resolve workspace scope</h2>
                <p>{detection.message}</p>
              </div>
              <ul className="brief-scope-list">
                {detection.candidates.map((candidate) => (
                  <li key={candidate.relativePath}>
                    <div className="brief-scope-item-copy">
                      <strong>{candidate.label}</strong>
                      <code title={candidate.relativePath}>{candidate.relativePath}</code>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void openResourceRoot(candidate.directory)}
                    >
                      Choose resource
                    </button>
                  </li>
                ))}
              </ul>
              <div className="brief-scope-actions">
                <button type="button" className="secondary" onClick={() => void openFolder()}>
                  Browse for another folder
                </button>
                <button type="button" className="brief-text-action" onClick={handleForceScope}>
                  Use this folder anyway
                </button>
              </div>
            </m.section>
          </AnimatePresence>
        ) : null}

        {summary.isError ? (
          <div className="error-banner" role="alert">
            Cortex could not read the workspace summary. Tools remain available; try switching
            workspaces if folder permissions changed.
          </div>
        ) : null}

        <div className="brief-layout">
          <div className="brief-main">
            <section className="brief-section" aria-labelledby="brief-findings-title">
              <header className="brief-section-head">
                <h2 id="brief-findings-title">Needs attention</h2>
                {findings.length > 0 ? (
                  <span className="brief-section-count">{findings.length}</span>
                ) : null}
              </header>
              {summary.isPending ? (
                <BriefSkeleton rows={3} />
              ) : attentionFindings.length === 0 ? (
                <p className="brief-empty-line">
                  <Check aria-hidden="true" />
                  No blocking issues detected. Continue with validation or analysis.
                </p>
              ) : (
                <ul className="brief-finding-list">
                  {attentionFindings.map((finding) => (
                    <li key={finding.id} className={`is-${finding.severity}`}>
                      <div className="brief-finding-main">
                        <span
                          className="brief-finding-severity"
                          aria-label={severityLabel(finding.severity)}
                        >
                          <AlertTriangle aria-hidden="true" />
                        </span>
                        <div className="brief-finding-copy">
                          <strong>{finding.title}</strong>
                          {finding.detail ? <p>{finding.detail}</p> : null}
                          <span className="brief-finding-tool">{finding.tool}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="brief-finding-action"
                        onClick={finding.onAction}
                      >
                        {finding.action}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {findings.length > attentionFindings.length ? (
                <button
                  type="button"
                  className="brief-text-action"
                  onClick={() => go('sentinel', 'Sentinel validation')}
                >
                  View all
                  <ArrowRight aria-hidden="true" />
                </button>
              ) : null}
            </section>

            {visibleTopFindings.length > 0 ? (
              <section className="brief-section" aria-labelledby="brief-top-findings-title">
                <header className="brief-section-head">
                  <h2 id="brief-top-findings-title">Top findings</h2>
                </header>
                <ul className="brief-finding-list is-secondary">
                  {visibleTopFindings.map((finding) => (
                    <li key={finding.id} className={`is-${finding.severity}`}>
                      <div className="brief-finding-main">
                        <span
                          className="brief-finding-severity"
                          aria-label={severityLabel(finding.severity)}
                        >
                          <AlertTriangle aria-hidden="true" />
                        </span>
                        <div className="brief-finding-copy">
                          <strong>{finding.title}</strong>
                          {finding.detail ? <p>{finding.detail}</p> : null}
                          <span className="brief-finding-tool">{finding.tool}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="brief-finding-action"
                        onClick={finding.onAction}
                      >
                        {finding.action}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="brief-aside">
            <section className="brief-section" aria-labelledby="brief-snapshot-title">
              <header className="brief-section-head">
                <h2 id="brief-snapshot-title">Project snapshot</h2>
              </header>
              {summary.isPending ? (
                <BriefSkeleton rows={3} />
              ) : (
                <>
                  <dl className="brief-metrics-ruler">
                    {snapshotMetrics.map((metric) => (
                      <div key={metric.label}>
                        <dt>{metric.label}</dt>
                        <dd>{metric.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <dl className="brief-snapshot-props">
                    <div>
                      <dt>Resource type</dt>
                      <dd>{projectType}</dd>
                    </div>
                    <div>
                      <dt>Runtime</dt>
                      <dd>{runtimeLabel}</dd>
                    </div>
                    <div>
                      <dt>Manifest state</dt>
                      <dd className={missingCount > 0 ? 'is-attention' : undefined}>
                        {manifestStateLabel}
                      </dd>
                    </div>
                    <div>
                      <dt>Last analyzed</dt>
                      <dd>{formatAnalyzedTime(summary.data?.indexedAt)}</dd>
                    </div>
                  </dl>
                </>
              )}
            </section>

            <section className="brief-section" aria-labelledby="brief-manifest-title">
              <header className="brief-section-head">
                <h2 id="brief-manifest-title">Manifest summary</h2>
              </header>
              {summary.isPending ? (
                <BriefSkeleton rows={3} />
              ) : !hasManifest ? (
                <p className="brief-aside-empty">No manifest at workspace root.</p>
              ) : manifest ? (
                <>
                  <dl className="brief-aside-spec compact">
                    <div>
                      <dt>State</dt>
                      <dd
                        className={
                          missingCount > 0 || unsupportedCount > 0 ? 'is-attention' : undefined
                        }
                      >
                        {manifestStateLabel}
                      </dd>
                    </div>
                    <div>
                      <dt>Runtime</dt>
                      <dd>{runtimeLabel}</dd>
                    </div>
                    <div>
                      <dt>Declared</dt>
                      <dd>
                        {manifest.declaredFiles} file{manifest.declaredFiles === 1 ? '' : 's'} ·{' '}
                        {manifest.declaredScriptEntries} script
                        {manifest.declaredScriptEntries === 1 ? '' : 's'}
                      </dd>
                    </div>
                    <div>
                      <dt>Missing paths</dt>
                      <dd className={missingCount > 0 ? 'is-attention' : undefined}>
                        {missingCount}
                      </dd>
                    </div>
                    <div>
                      <dt>Manual review</dt>
                      <dd className={unsupportedCount > 0 ? 'is-attention' : undefined}>
                        {reviewLineLabel(unsupportedCount)}
                      </dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className="brief-text-action"
                    onClick={() => go('index', 'Index')}
                  >
                    Open in Index
                    <ArrowRight aria-hidden="true" />
                  </button>
                </>
              ) : (
                <p className="brief-aside-empty">Manifest details unavailable.</p>
              )}
            </section>

            <section className="brief-section" aria-labelledby="brief-interface-title">
              <header className="brief-section-head">
                <h2 id="brief-interface-title">Interface summary</h2>
              </header>
              {scripts === 0 ? (
                <p className="brief-aside-empty">No scripts detected in this workspace.</p>
              ) : analysis.isPending || analysis.isFetching ? (
                <BriefSkeleton rows={2} />
              ) : (
                <>
                  <dl className="brief-aside-spec compact">
                    <div>
                      <dt>Scripts</dt>
                      <dd>{surface?.scripts ?? scripts}</dd>
                    </div>
                    <div>
                      <dt>Events</dt>
                      <dd>{eventCount}</dd>
                    </div>
                    <div>
                      <dt>Exports</dt>
                      <dd>{exportCount}</dd>
                    </div>
                    <div>
                      <dt>Commands</dt>
                      <dd>{commandCount}</dd>
                    </div>
                  </dl>
                  {topSymbols.length > 0 ? (
                    <ul className="brief-symbol-list">
                      {topSymbols.map((symbol) => (
                        <li key={`${symbol.kind}-${symbol.name}`}>
                          <span>{symbol.kind}</span>
                          <code title={symbol.name}>{symbol.name}</code>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <button
                    type="button"
                    className="brief-text-action"
                    onClick={() => go('wire', 'Wire')}
                  >
                    Open in Wire
                    <ArrowRight aria-hidden="true" />
                  </button>
                </>
              )}
            </section>

            <section className="brief-section" aria-labelledby="brief-composition-title">
              <header className="brief-section-head">
                <h2 id="brief-composition-title">Content composition</h2>
              </header>
              {summary.isPending ? (
                <BriefSkeleton rows={2} />
              ) : totalFiles === 0 ? (
                <p className="brief-aside-empty">No files indexed yet.</p>
              ) : (
                <>
                  <ul className="brief-composition-legend">
                    {compositionRows.map((row) => (
                      <li key={row.label}>
                        <span
                          className={`brief-composition-swatch tone-${row.tone}`}
                          aria-hidden="true"
                        />
                        <span className="brief-composition-label">{row.label}</span>
                        <span className="brief-composition-value">{row.pct}%</span>
                        <span className="sr-only">
                          {row.count} file{row.count === 1 ? '' : 's'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div
                    className="brief-composition-bar"
                    role="img"
                    aria-label={`File composition: ${compositionLine}`}
                  >
                    {compositionRows.map((row) => (
                      <span
                        key={row.label}
                        className={`tone-${row.tone}`}
                        style={{ flexGrow: Math.max(row.pct, 1) }}
                        title={`${row.label}: ${row.count} files (${row.pct}%)`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="brief-text-action"
                    aria-expanded={detailsOpen}
                    onClick={() => setDetailsOpen((open) => !open)}
                  >
                    View workspace details
                    <ChevronDown
                      aria-hidden="true"
                      className={detailsOpen ? 'is-open' : undefined}
                    />
                  </button>
                  <AnimatePresence initial={false} mode="wait">
                    {detailsOpen ? (
                      <m.div key="brief-details" className="brief-details" {...detailsMotion}>
                        {topFolders.length > 0 ? (
                          <div>
                            <h3>Top folders</h3>
                            <ul className="brief-rank-list">
                              {topFolders.map((folder) => (
                                <li key={folder.name}>
                                  <code title={folder.name}>{folder.name}</code>
                                  <span>{folder.count}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {(summary.data?.extensions.length ?? 0) > 0 ? (
                          <div>
                            <h3>Extensions</h3>
                            <ul className="brief-rank-list">
                              {summary.data?.extensions.map((entry) => (
                                <li key={entry.ext}>
                                  <code title={entry.ext}>{entry.ext}</code>
                                  <span>{entry.count}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </m.div>
                    ) : null}
                  </AnimatePresence>
                </>
              )}
            </section>
          </aside>
        </div>

        <section className="brief-activity-section" aria-labelledby="brief-activity-title">
          <header className="brief-section-head">
            <h2 id="brief-activity-title">Recent activity</h2>
          </header>
          <ul className="brief-activity-timeline">
            {recentActivity.length === 0 ? (
              <li className="brief-activity-row">
                <span className="brief-activity-icon" aria-hidden="true">
                  <FolderOpen />
                </span>
                <span className="brief-activity-copy">
                  <span className="brief-activity-action">Workspace opened</span>
                  <span className="brief-activity-result">{name}</span>
                </span>
                <time
                  className="brief-activity-time"
                  dateTime={summary.data?.indexedAt ?? new Date().toISOString()}
                  title={formatSessionTime(summary.data?.indexedAt ?? new Date().toISOString())}
                >
                  {formatRelativeTime(summary.data?.indexedAt ?? new Date().toISOString()) ??
                    'just now'}
                </time>
              </li>
            ) : (
              recentActivity.map((entry) => {
                const meta = ACTIVITY_TOOL_META[entry.tool];
                const Icon = meta?.icon ?? FolderOpen;
                const display = formatActivityDisplay(entry);
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className={`brief-activity-row is-${entry.status}`}
                      onClick={() => {
                        if (entry.navigate.kind !== 'welcome') {
                          go(entry.navigate.kind, entry.navigate.tabLabel);
                        }
                      }}
                    >
                      <span className={`brief-activity-icon is-${entry.status}`} aria-hidden="true">
                        <Icon />
                      </span>
                      <span className="brief-activity-copy">
                        <span className="brief-activity-action">{display.action}</span>
                        <span className="brief-activity-result">{display.result}</span>
                      </span>
                      <time
                        className="brief-activity-time"
                        dateTime={entry.at}
                        title={formatSessionTime(entry.at)}
                      >
                        {formatRelativeTime(entry.at) ?? 'recently'}
                      </time>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

function resolveFolderDirection(prev: string | null, root: string | null): FolderNavDirection {
  if (!prev && root) return 'enter';
  if (prev && !root) return 'exit';
  if (!prev || !root) return 'enter';

  const normalizedPrev = prev.replace(/[\\/]+$/, '').toLowerCase();
  const normalizedRoot = root.replace(/[\\/]+$/, '').toLowerCase();
  const drillingOut =
    normalizedPrev.startsWith(`${normalizedRoot}\\`) ||
    normalizedPrev.startsWith(`${normalizedRoot}/`);

  return drillingOut ? 'back' : 'switch';
}

export function StartView(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const root = workspace?.root ?? null;
  const prevRootRef = useRef(root);
  const directionRef = useRef<FolderNavDirection>('enter');

  const prev = prevRootRef.current;
  if (prev !== root) {
    directionRef.current = resolveFolderDirection(prev, root);
    prevRootRef.current = root;
  }

  return (
    <SectionPageHost
      pageKey={root ?? 'launchpad'}
      variant="folder"
      direction={directionRef.current}
      className="start-view-host"
    >
      {workspace ? <WorkspaceBriefPanel /> : <HomeModuleHub />}
    </SectionPageHost>
  );
}
