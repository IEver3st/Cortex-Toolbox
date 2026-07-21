import type { ResourceAnalysis } from '@cortex/script-analysis';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Braces,
  Crosshair,
  FileCode2,
  FileText,
  Focus,
  Hexagon,
  Network,
  Pencil,
  Radio,
  Search,
  Terminal,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CodeEditor } from '../../components/CodeEditor';
import { EmptyState, Toggle } from '../../components/UiPrimitives';
import { recordActivity } from '../../lib/activity-history';
import { unwrap } from '../../lib/result';
import { PROBE_WIRE_FOCUS_KEY, type ProbeWireFocus } from '../../lib/probe-history';
import { useWorkspaceStore } from '../../store/workspace';

type DisplayKind =
  'config' | 'manifest' | 'function' | 'thread' | 'event' | 'export' | 'command' | 'dependency';
type ViewMode = 'map' | 'editor';
type KindFilter = 'script' | 'function' | 'event' | 'export' | 'command';
type GraphEdge = ResourceAnalysis['edges'][number] & { kind: string };

interface GraphNode {
  id: string;
  label: string;
  kind: ResourceAnalysis['nodes'][number]['kind'];
  displayKind: DisplayKind;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  editable: boolean;
}

interface EditSession {
  relativePath: string;
  startLine: number;
  endLine: number;
  label: string;
  displayKind: DisplayKind;
  nodeId: string;
  fullSource: string;
  sliceSource: string;
  editedSlice: string;
}

const NODE_WIDTH = 248;
const NODE_HEIGHT = 58;
const NODE_GAP = 28;
const ROW_HEIGHT = NODE_HEIGHT + NODE_GAP;
const COLUMN_WIDTH = NODE_WIDTH + 112;
const CLUSTER_GAP = 56;
const LAYOUT_ORIGIN = { x: 56, y: 36 };
const LAYOUT_KEY = 'cortex.wire.layout.v2';
const KIND_FILTERS: KindFilter[] = ['script', 'function', 'event', 'export', 'command'];

const DISPLAY_LABEL: Record<DisplayKind, string> = {
  config: 'Config',
  manifest: 'Manifest',
  function: 'Function',
  thread: 'Thread',
  event: 'Event',
  export: 'Export',
  command: 'Command',
  dependency: 'Dependency',
};

function readStoredLayout(workspaceRoot: string): Record<string, { x: number; y: number }> {
  try {
    const raw = globalThis.localStorage.getItem(`${LAYOUT_KEY}:${workspaceRoot}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>;
    return parsed;
  } catch {
    return {};
  }
}

function writeStoredLayout(
  workspaceRoot: string,
  positions: Record<string, { x: number; y: number }>,
): void {
  try {
    globalThis.localStorage.setItem(`${LAYOUT_KEY}:${workspaceRoot}`, JSON.stringify(positions));
  } catch {
    // Ignore quota errors.
  }
}

function resolveDisplayKind(node: ResourceAnalysis['nodes'][number]): DisplayKind {
  if (node.kind === 'file') {
    const base = node.label.split(/[\\/]/).pop()?.toLowerCase() ?? '';
    if (base === 'fxmanifest.lua' || base === '__resource.lua') return 'manifest';
    return 'config';
  }
  if (node.kind === 'function' && node.label === 'CreateThread') return 'thread';
  return node.kind;
}

function kindFilterForNode(displayKind: DisplayKind): KindFilter | null {
  if (displayKind === 'config' || displayKind === 'manifest') return 'script';
  if (displayKind === 'function' || displayKind === 'thread') return 'function';
  if (displayKind === 'event') return 'event';
  if (displayKind === 'export') return 'export';
  if (displayKind === 'command') return 'command';
  return null;
}

function nodeSubtitle(analysis: ResourceAnalysis, node: ResourceAnalysis['nodes'][number]): string {
  if (node.kind === 'file') return node.label;
  const owner = analysis.edges.find((edge) => edge.to === node.id && edge.from.startsWith('file:'));
  return owner ? owner.from.slice('file:'.length) : node.kind;
}

function filePathFromId(fileId: string): string {
  return fileId.slice('file:'.length);
}

function collectClusterNodes(
  fileId: string,
  nodes: ResourceAnalysis['nodes'],
  edges: ResourceAnalysis['edges'],
): Set<string> {
  const filePath = filePathFromId(fileId);
  const functionPrefix = `function:${filePath}:`;
  const cluster = new Set<string>([fileId]);

  for (const node of nodes) {
    if (node.id.startsWith(functionPrefix)) cluster.add(node.id);
  }
  for (const edge of edges) {
    if (edge.from === fileId) cluster.add(edge.to);
  }

  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of edges) {
      const fromInCluster = cluster.has(edge.from);
      const toInCluster = cluster.has(edge.to);
      if (fromInCluster && !toInCluster) {
        cluster.add(edge.to);
        grew = true;
      }
      if (toInCluster && edge.from.startsWith(functionPrefix) && !cluster.has(edge.from)) {
        cluster.add(edge.from);
        grew = true;
      }
    }
  }

  return cluster;
}

function assignLayers(
  rootId: string,
  clusterIds: Set<string>,
  nodes: ResourceAnalysis['nodes'],
  edges: ResourceAnalysis['edges'],
): Map<string, number> {
  const layers = new Map<string, number>([[rootId, 0]]);
  const clusterEdges = edges.filter((edge) => clusterIds.has(edge.from) && clusterIds.has(edge.to));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (let pass = 0; pass < clusterIds.size; pass += 1) {
    for (const edge of clusterEdges) {
      const fromLayer = layers.get(edge.from);
      if (fromLayer === undefined) continue;
      const nextLayer = fromLayer + 1;
      const current = layers.get(edge.to) ?? -1;
      if (nextLayer > current) layers.set(edge.to, nextLayer);
    }
  }

  for (const id of clusterIds) {
    const node = nodeById.get(id);
    if (!node || node.kind === 'file') continue;
    const flowLayer =
      node.kind === 'function' ? 1 : node.kind === 'export' ? 2 : node.kind === 'event' ? 3 : 1;
    layers.set(id, Math.max(layers.get(id) ?? 1, flowLayer));
  }

  for (const id of clusterIds) {
    if (!layers.has(id)) layers.set(id, 1);
  }

  return layers;
}

function layoutCluster(
  rootId: string,
  clusterIds: Set<string>,
  nodes: ResourceAnalysis['nodes'],
  edges: ResourceAnalysis['edges'],
  originY: number,
): Map<string, { x: number; y: number }> {
  const layers = assignLayers(rootId, clusterIds, nodes, edges);
  const byLayer = new Map<number, string[]>();

  for (const id of clusterIds) {
    const layer = layers.get(id) ?? 1;
    const bucket = byLayer.get(layer) ?? [];
    bucket.push(id);
    byLayer.set(layer, bucket);
  }

  const labelById = new Map(nodes.map((node) => [node.id, node.label]));
  const positions = new Map<string, { x: number; y: number }>();

  for (const [layer, ids] of byLayer) {
    ids.sort((left, right) =>
      (labelById.get(left) ?? left).localeCompare(labelById.get(right) ?? right),
    );
    let rowY = originY;
    const x = LAYOUT_ORIGIN.x + layer * COLUMN_WIDTH;
    for (const id of ids) {
      positions.set(id, { x, y: rowY });
      rowY += ROW_HEIGHT;
    }
  }

  return positions;
}

function resolveCollisions(
  positions: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const resolved = new Map(positions);
  const byColumn = new Map<number, string[]>();

  for (const [id, point] of resolved) {
    const column = Math.round(point.x);
    const bucket = byColumn.get(column) ?? [];
    bucket.push(id);
    byColumn.set(column, bucket);
  }

  for (const ids of byColumn.values()) {
    ids.sort((left, right) => (resolved.get(left)?.y ?? 0) - (resolved.get(right)?.y ?? 0));
    let lastBottom = -Infinity;
    for (const id of ids) {
      const point = resolved.get(id);
      if (!point) continue;
      const minY = lastBottom + NODE_GAP;
      if (point.y < minY) resolved.set(id, { x: point.x, y: minY });
      lastBottom = (resolved.get(id)?.y ?? point.y) + NODE_HEIGHT;
    }
  }

  return resolved;
}

function buildInitialPositions(
  nodes: ResourceAnalysis['nodes'],
  edges: ResourceAnalysis['edges'],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const placed = new Set<string>();
  const files = nodes.filter((node) => node.kind === 'file');
  let clusterY = LAYOUT_ORIGIN.y;

  for (const file of files) {
    const clusterIds = collectClusterNodes(file.id, nodes, edges);
    const pending = [...clusterIds].filter((id) => !placed.has(id));
    if (!pending.length) continue;

    const pendingSet = new Set(pending);
    const clusterPositions = layoutCluster(file.id, pendingSet, nodes, edges, clusterY);
    let clusterBottom = clusterY;

    for (const [id, point] of clusterPositions) {
      positions.set(id, point);
      placed.add(id);
      clusterBottom = Math.max(clusterBottom, point.y + NODE_HEIGHT);
    }

    clusterY = clusterBottom + CLUSTER_GAP;
  }

  let orphanY = clusterY;
  for (const node of nodes) {
    if (placed.has(node.id)) continue;
    positions.set(node.id, { x: LAYOUT_ORIGIN.x + COLUMN_WIDTH, y: orphanY });
    orphanY += ROW_HEIGHT;
    placed.add(node.id);
  }

  return resolveCollisions(positions);
}

function buildGraphNodes(
  analysis: ResourceAnalysis,
  filters: {
    query: string;
    kinds: Set<KindFilter>;
    hideUnconnected: boolean;
    edges: GraphEdge[];
  },
  stored: Record<string, { x: number; y: number }>,
): GraphNode[] {
  const connected = new Set<string>();
  for (const edge of filters.edges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }

  const match = filters.query.trim().toLowerCase();
  const initial = buildInitialPositions(analysis.nodes, filters.edges);

  return analysis.nodes
    .filter((node) => {
      const displayKind = resolveDisplayKind(node);
      const filter = kindFilterForNode(displayKind);
      if (filter && !filters.kinds.has(filter)) return false;
      if (filters.hideUnconnected && !connected.has(node.id)) return false;
      if (!match) return true;
      const haystack = `${node.label} ${displayKind} ${nodeSubtitle(analysis, node)}`.toLowerCase();
      return haystack.includes(match);
    })
    .map((node) => {
      const displayKind = resolveDisplayKind(node);
      const point = stored[node.id] ?? initial.get(node.id) ?? LAYOUT_ORIGIN;
      return {
        id: node.id,
        label: node.label.split(/[\\/]/).pop() ?? node.label,
        kind: node.kind,
        displayKind,
        subtitle: nodeSubtitle(analysis, node),
        x: point.x,
        y: point.y,
        width: NODE_WIDTH,
        editable: true,
      };
    });
}

function connectorPath(from: GraphNode, to: GraphNode): string {
  const startX = from.x + from.width;
  const startY = from.y + NODE_HEIGHT / 2;
  const endX = to.x;
  const endY = to.y + NODE_HEIGHT / 2;
  if (startX <= endX) {
    const middle = startX + (endX - startX) * 0.5;
    return `M ${startX} ${startY} C ${middle} ${startY}, ${middle} ${endY}, ${endX} ${endY}`;
  }
  const loop = Math.max(startX, endX) + 48;
  return `M ${startX} ${startY} C ${loop} ${startY}, ${loop} ${endY}, ${endX} ${endY}`;
}

function resolveEditTarget(
  analysis: ResourceAnalysis,
  node: GraphNode,
): Omit<EditSession, 'fullSource' | 'sliceSource' | 'editedSlice'> | null {
  if (node.kind === 'file') {
    const path = node.id.slice('file:'.length);
    const file = analysis.files.find((item) => item.relativePath === path);
    if (!file) return null;
    return {
      relativePath: path,
      startLine: 1,
      endLine: file.lines,
      label: node.label,
      displayKind: node.displayKind,
      nodeId: node.id,
    };
  }

  const owner = analysis.edges.find((edge) => edge.to === node.id && edge.from.startsWith('file:'));
  const path = owner?.from.slice('file:'.length) ?? node.subtitle;
  const file = analysis.files.find((item) => item.relativePath === path);
  if (!file) return null;

  const symbol = file.symbols.find((item) => item.name === node.label);
  if (!symbol) return null;

  const piece = file.pieces.find((item) =>
    item.symbols.some((entry) => entry.name === symbol.name && entry.line === symbol.line),
  );
  const startLine = piece?.startLine ?? symbol.line;
  const endLine = piece?.endLine ?? symbol.evidence.endLine;

  return {
    relativePath: path,
    startLine,
    endLine,
    label: node.label,
    displayKind: node.displayKind,
    nodeId: node.id,
  };
}

function extractSlice(source: string, startLine: number, endLine: number): string {
  return source
    .replaceAll('\r\n', '\n')
    .split('\n')
    .slice(startLine - 1, endLine)
    .join('\n');
}

function mergeSlice(fullSource: string, startLine: number, endLine: number, slice: string): string {
  const lines = fullSource.replaceAll('\r\n', '\n').split('\n');
  return [...lines.slice(0, startLine - 1), ...slice.split('\n'), ...lines.slice(endLine)].join(
    '\n',
  );
}

function kindCounts(analysis: ResourceAnalysis): Record<KindFilter, number> {
  const counts: Record<KindFilter, number> = {
    script: 0,
    function: 0,
    event: 0,
    export: 0,
    command: 0,
  };
  for (const node of analysis.nodes) {
    const filter = kindFilterForNode(resolveDisplayKind(node));
    if (filter) counts[filter] += 1;
  }
  return counts;
}

function NodeIcon({ kind }: { kind: DisplayKind }): React.JSX.Element {
  if (kind === 'manifest') return <FileText aria-hidden="true" />;
  if (kind === 'config') return <FileCode2 aria-hidden="true" />;
  if (kind === 'function' || kind === 'thread') return <Braces aria-hidden="true" />;
  if (kind === 'export') return <Hexagon aria-hidden="true" />;
  if (kind === 'event') return <Radio aria-hidden="true" />;
  if (kind === 'command') return <Terminal aria-hidden="true" />;
  return <Crosshair aria-hidden="true" />;
}

function WireGraphCanvas({
  analysis,
  nodes,
  edges,
  selectedNode,
  zoom,
  onSelect,
  onEdit,
  onMoveNode,
  viewReset,
  onZoomChange,
}: {
  analysis: ResourceAnalysis;
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: string | null;
  zoom: number;
  viewReset: number;
  onSelect: (node: GraphNode) => void;
  onEdit: (node: GraphNode) => void;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
  onZoomChange: (zoom: number) => void;
}): React.JSX.Element {
  const positions = new Map(nodes.map((node) => [node.id, node]));
  const width = Math.max(...nodes.map((node) => node.x + node.width), 720) + 120;
  const height = Math.max(...nodes.map((node) => node.y + NODE_HEIGHT), 420) + 120;

  const [pan, setPan] = useState({ x: 48, y: 48 });
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const dragRef = useRef<{
    nodeId: string;
    x: number;
    y: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    setPan({ x: 48, y: 48 });
  }, [viewReset]);

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.wire-card')) return;
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      const deltaX = (event.clientX - dragRef.current.x) / zoom;
      const deltaY = (event.clientY - dragRef.current.y) / zoom;
      onMoveNode(
        dragRef.current.nodeId,
        dragRef.current.originX + deltaX,
        dragRef.current.originY + deltaY,
      );
      return;
    }
    if (!panRef.current) return;
    setPan({
      x: panRef.current.panX + event.clientX - panRef.current.x,
      y: panRef.current.panY + event.clientY - panRef.current.y,
    });
  };

  const endPointer = () => {
    panRef.current = null;
    dragRef.current = null;
    setIsPanning(false);
  };

  const onNodePointerDown = (event: React.PointerEvent<HTMLElement>, node: GraphNode) => {
    if ((event.target as HTMLElement).closest('.wire-card-action')) return;
    event.stopPropagation();
    dragRef.current = {
      nodeId: node.id,
      x: event.clientX,
      y: event.clientY,
      originX: node.x,
      originY: node.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
    onZoomChange(Math.min(1.5, Math.max(0.5, zoom + delta)));
  };

  return (
    <div
      className={`wire-graph-scroll${isPanning ? ' is-panning' : ''}`}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onWheel={onWheel}
    >
      <div
        className="wire-graph-canvas"
        style={{
          width,
          height,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <svg width={width} height={height} aria-hidden="true">
          <defs>
            <marker
              id="wire-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <circle cx="4" cy="4" r="2.5" fill="currentColor" />
            </marker>
          </defs>
          {edges.map((edge, index) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            return (
              <path
                key={`${edge.from}-${edge.to}-${index}`}
                d={connectorPath(from, to)}
                className={`wire-edge edge-${edge.kind}`}
                markerEnd="url(#wire-arrow)"
              />
            );
          })}
        </svg>
        {nodes.map((node) => (
          <article
            key={node.id}
            className={`wire-card kind-${node.displayKind}${selectedNode === node.id ? ' is-selected' : ''}`}
            style={{ left: node.x, top: node.y, width: node.width }}
            onPointerDown={(event) => onNodePointerDown(event, node)}
            onClick={() => onSelect(node)}
          >
            <span className="wire-card-port wire-card-port-in" aria-hidden="true" />
            <div className="wire-card-body">
              <header className="wire-card-header">
                <NodeIcon kind={node.displayKind} />
                <span className="wire-card-kind">{DISPLAY_LABEL[node.displayKind]}</span>
                {node.editable ? (
                  <div className="wire-card-actions">
                    <button
                      type="button"
                      className="wire-card-action"
                      aria-label={`Edit ${node.label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(node);
                      }}
                    >
                      <Pencil aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </header>
              <strong>{node.label}</strong>
              <small>{node.subtitle}</small>
            </div>
            <span className="wire-card-port wire-card-port-out" aria-hidden="true" />
          </article>
        ))}
      </div>
      <span className="wire-graph-meta" aria-live="polite">
        {analysis.summary.scripts} scripts · {analysis.edges.length} edges · {nodes.length} nodes
      </span>
    </div>
  );
}

function WireEditorPane({
  session,
  planId,
  dirty,
  onChange,
  onReview,
  onApply,
}: {
  session: EditSession;
  planId: string | null;
  dirty: boolean;
  onChange: (value: string) => void;
  onReview: () => void;
  onApply: () => void;
}): React.JSX.Element {
  return (
    <div className="wire-editor">
      <div className="wire-editor-toolbar">
        <div>
          <strong>
            {DISPLAY_LABEL[session.displayKind]} · {session.label}
          </strong>
          <span>
            {session.relativePath} · lines {session.startLine}–{session.endLine}
          </span>
        </div>
        <div className="header-actions">
          <button type="button" disabled={!dirty} onClick={onReview}>
            Review changes
          </button>
          {planId ? (
            <button type="button" className="primary" onClick={onApply}>
              Apply safely
            </button>
          ) : null}
        </div>
      </div>
      <CodeEditor
        label={`Edit ${session.label} in ${session.relativePath}`}
        value={session.editedSlice}
        onChange={onChange}
      />
    </div>
  );
}

export default function Wire(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewMode>('map');

  const [query, setQuery] = useState('');
  const [hideUnconnected, setHideUnconnected] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [kindFilters, setKindFilters] = useState<Set<KindFilter>>(() => new Set(KIND_FILTERS));
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [editSession, setEditSession] = useState<EditSession | null>(null);
  const [writePlanId, setWritePlanId] = useState<string | null>(null);
  const [viewReset, setViewReset] = useState(0);
  const paneHostRef = useRef<HTMLDivElement>(null);
  const [, setLayoutEpoch] = useState(0);

  const analysis = useQuery({
    queryKey: ['wire-analysis', workspace?.root],
    queryFn: async () => unwrap(await window.cortex.resources.analyze()),
    enabled: Boolean(workspace),
  });

  useLayoutEffect(() => {
    const node = paneHostRef.current;
    if (!node) return;

    let lastHeight = 0;
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0;
      if (height > 0 && Math.abs(height - lastHeight) > 1) {
        lastHeight = height;
        setLayoutEpoch((value) => value + 1);
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [analysis.data, activeView]);

  useEffect(() => {
    setSelectedFile(null);
    setSelectedSymbol(null);
    setSelectedNode(null);
    setEditSession(null);
    setWritePlanId(null);
    setActiveView('map');
    if (workspace?.root) {
      setNodePositions(readStoredLayout(workspace.root));
    } else {
      setNodePositions({});
    }
  }, [workspace?.root]);

  useEffect(() => {
    if (!analysis.data) return;
    try {
      const raw = sessionStorage.getItem(PROBE_WIRE_FOCUS_KEY);
      if (!raw) return;
      sessionStorage.removeItem(PROBE_WIRE_FOCUS_KEY);
      const focus = JSON.parse(raw) as ProbeWireFocus;
      if (!focus.file || !focus.symbolName) return;
      setSelectedFile(focus.file);
      setSelectedSymbol(focus.symbolName);
      setActiveView('map');
      const nodeId =
        focus.symbolKind === 'function'
          ? `function:${focus.file}:${focus.symbolName}`
          : `${focus.symbolKind}:${focus.symbolName}`;
      setSelectedNode(nodeId);
    } catch {
      /* ignore malformed handoff */
    }
  }, [analysis.data]);

  useEffect(() => {
    const first = analysis.data?.files[0]?.relativePath;
    if (first && !selectedFile) {
      setSelectedFile(first);
      setSelectedNode(`file:${first}`);
    }
  }, [analysis.data, selectedFile]);

  const counts = useMemo(() => (analysis.data ? kindCounts(analysis.data) : null), [analysis.data]);

  useEffect(() => {
    if (!analysis.data || !workspace) return;
    const name = workspace.project?.name ?? workspace.root.split(/[\\/]/).at(-1) ?? workspace.root;
    const summary = analysis.data.summary;
    recordActivity({
      tool: 'wire',
      workspaceRoot: workspace.root,
      workspaceName: name,
      status: 'success',
      summary: `Map · ${summary.events} events · ${summary.exports} exports · ${summary.commands} commands`,
      navigate: { kind: 'wire', tabLabel: 'Wire' },
    });
  }, [analysis.data, workspace]);

  const visibleEdges = useMemo(() => {
    if (!analysis.data) return [] as GraphEdge[];
    return analysis.data.edges;
  }, [analysis.data]);

  const graphNodes = useMemo(() => {
    if (!analysis.data) return [];
    return buildGraphNodes(
      analysis.data,
      { query, kinds: kindFilters, hideUnconnected, edges: visibleEdges },
      nodePositions,
    );
  }, [analysis.data, query, kindFilters, hideUnconnected, visibleEdges, nodePositions]);

  const filteredEdges = useMemo(() => {
    const visibleIds = new Set(graphNodes.map((node) => node.id));
    return visibleEdges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));
  }, [graphNodes, visibleEdges]);

  const selected = useMemo(
    () => analysis.data?.files.find((file) => file.relativePath === selectedFile) ?? null,
    [analysis.data, selectedFile],
  );
  const selectedDefinition =
    selected?.symbols.find((symbol) => symbol.name === selectedSymbol) ?? null;
  const related = useMemo(() => {
    const matches =
      analysis.data?.edges.filter((edge) => {
        if (selectedNode) return edge.from === selectedNode || edge.to === selectedNode;
        return edge.from === `file:${selectedFile}` || edge.to === `file:${selectedFile}`;
      }) ?? [];
    return [
      ...new Map(matches.map((edge) => [`${edge.from}-${edge.kind}-${edge.to}`, edge])).values(),
    ];
  }, [analysis.data, selectedFile, selectedNode]);

  const breadcrumb = useMemo(() => {
    if (editSession) {
      return `${DISPLAY_LABEL[editSession.displayKind]} ${editSession.relativePath} line ${editSession.startLine}`;
    }
    if (selectedDefinition && selectedFile) {
      return `${DISPLAY_LABEL[resolveDisplayKind({ id: '', label: selectedDefinition.name, kind: selectedDefinition.kind })]} ${selectedFile} line ${selectedDefinition.line}`;
    }
    if (selectedFile) {
      const node = analysis.data?.nodes.find((item) => item.id === `file:${selectedFile}`);
      const displayKind = node ? resolveDisplayKind(node) : 'config';
      return `${DISPLAY_LABEL[displayKind]} ${selectedFile}`;
    }
    return 'Resource map';
  }, [analysis.data, editSession, selectedDefinition, selectedFile]);

  const persistPosition = (nodeId: string, x: number, y: number) => {
    setNodePositions((current) => {
      const next = { ...current, [nodeId]: { x: Math.max(8, x), y: Math.max(8, y) } };
      if (workspace?.root) writeStoredLayout(workspace.root, next);
      return next;
    });
  };

  const selectGraphNode = (node: GraphNode) => {
    setSelectedNode(node.id);
    if (node.kind === 'file') {
      setSelectedFile(node.id.slice('file:'.length));
      setSelectedSymbol(null);
      return;
    }
    const owningEdge = analysis.data?.edges.find(
      (edge) => edge.to === node.id && edge.from.startsWith('file:'),
    );
    if (owningEdge) setSelectedFile(owningEdge.from.slice('file:'.length));
    setSelectedSymbol(node.label);
  };

  const openEditor = async (node: GraphNode) => {
    if (!analysis.data) return;
    const target = resolveEditTarget(analysis.data, node);
    if (!target) {
      toast.error('Could not resolve an editable range for this node.');
      return;
    }
    try {
      const file = unwrap(await window.cortex.files.read({ relativePath: target.relativePath }));
      const slice = extractSlice(file.content, target.startLine, target.endLine);
      setEditSession({
        ...target,
        fullSource: file.content,
        sliceSource: slice,
        editedSlice: slice,
      });
      setWritePlanId(null);
      setActiveView('editor');
      selectGraphNode(node);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open editor.');
    }
  };

  const reviewEdit = async () => {
    if (!editSession) return;
    const merged = mergeSlice(
      editSession.fullSource,
      editSession.startLine,
      editSession.endLine,
      editSession.editedSlice,
    );
    try {
      const plan = unwrap(
        await window.cortex.files.planWrite({
          relativePath: editSession.relativePath,
          source: merged,
        }),
      );
      setWritePlanId(plan.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not prepare the change.');
    }
  };

  const applyEdit = async () => {
    if (!writePlanId || !editSession) return;
    try {
      unwrap(await window.cortex.files.applyWrite({ planId: writePlanId }));
      const merged = mergeSlice(
        editSession.fullSource,
        editSession.startLine,
        editSession.endLine,
        editSession.editedSlice,
      );
      setEditSession({
        ...editSession,
        fullSource: merged,
        sliceSource: editSession.editedSlice,
      });
      setWritePlanId(null);
      await queryClient.invalidateQueries({ queryKey: ['wire-analysis', workspace?.root] });
      toast.success('Source updated with a recoverable backup.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the file.');
    }
  };

  const toggleKindFilter = (kind: KindFilter) => {
    setKindFilters((current) => {
      const next = new Set(current);
      if (next.has(kind)) {
        if (next.size === 1) return current;
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  };

  const centerView = () => {
    setViewReset((value) => value + 1);
    setZoom(1);
  };

  const editDirty = editSession ? editSession.editedSlice !== editSession.sliceSource : false;

  return (
    <div className="module-page wire-view">
      {analysis.isFetching && !analysis.data ? (
        <div className="wire-loading" aria-live="polite">
          Building code map…
        </div>
      ) : null}
      {!analysis.data && !analysis.isFetching ? (
        <EmptyState
          icon={Network}
          title="No code map yet"
          description="Open a resource workspace to analyze scripts, events, exports, and statically provable calls."
        />
      ) : null}
      {analysis.data ? (
        <div className="wire-workspace">
          <section className="wire-graph-panel">
            <header className="wire-graph-toolbar">
              <div className="wire-view-tabs segmented">
                <button
                  type="button"
                  className={activeView === 'map' ? 'active' : ''}
                  onClick={() => setActiveView('map')}
                >
                  Visual map
                </button>
                <button
                  type="button"
                  className={activeView === 'editor' ? 'active' : ''}
                  onClick={() => setActiveView('editor')}
                  disabled={!editSession}
                >
                  Code editor
                </button>
              </div>
              <span className="wire-breadcrumb">{breadcrumb}</span>
              <div className="wire-toolbar-controls">
                <label className="wire-search">
                  <Search aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    placeholder="Filter nodes"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <Toggle
                  id="wire-hide-unconnected"
                  checked={hideUnconnected}
                  onChange={setHideUnconnected}
                  ariaLabel="Hide unconnected nodes"
                />
                <span className="wire-toggle-label">Hide unconnected</span>
                <span className="wire-zoom-label">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  className="wire-icon-button"
                  aria-label="Center view"
                  onClick={centerView}
                >
                  <Focus aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="wire-filter-row">
              {KIND_FILTERS.map((kind) => {
                const active = kindFilters.has(kind);
                const count = counts?.[kind] ?? 0;
                return (
                  <button
                    key={kind}
                    type="button"
                    className={`wire-filter-chip${active ? ' is-active' : ''}${count === 0 ? ' is-empty' : ''}`}
                    disabled={count === 0}
                    onClick={() => toggleKindFilter(kind)}
                  >
                    {kind}
                    <span>{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="wire-view-stage">
              <div className="wire-pane-host" ref={paneHostRef}>
                <div
                  className={`wire-view-pane${activeView === 'map' ? ' is-active' : ''}`}
                  aria-hidden={activeView !== 'map'}
                >
                  <WireGraphCanvas
                    analysis={analysis.data}
                    nodes={graphNodes}
                    edges={filteredEdges}
                    selectedNode={selectedNode}
                    zoom={zoom}
                    viewReset={viewReset}
                    onSelect={selectGraphNode}
                    onEdit={(node) => void openEditor(node)}
                    onMoveNode={persistPosition}
                    onZoomChange={setZoom}
                  />
                </div>
                <div
                  className={`wire-view-pane${activeView === 'editor' ? ' is-active' : ''}`}
                  aria-hidden={activeView !== 'editor'}
                >
                  {editSession ? (
                    <WireEditorPane
                      session={editSession}
                      planId={writePlanId}
                      dirty={editDirty}
                      onChange={(value) => {
                        setEditSession((current) =>
                          current ? { ...current, editedSlice: value } : current,
                        );
                        setWritePlanId(null);
                      }}
                      onReview={() => void reviewEdit()}
                      onApply={() => void applyEdit()}
                    />
                  ) : (
                    <div className="wire-editor-empty">
                      Select a node and use the edit action to open a scoped source editor.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <footer className="wire-legend">
              <span>
                <i className="kind-config" /> Config
              </span>
              <span>
                <i className="kind-function" /> Function
              </span>
              <span>
                <i className="kind-event" /> Event
              </span>
              <span>
                <i className="kind-export" /> Export
              </span>
              <span>
                <i className="edge-defines" /> Defines
              </span>
              <span>
                <i className="edge-listens" /> Listens
              </span>
              <span>
                <i className="edge-emits" /> Emits
              </span>
              <span>
                <i className="edge-calls" /> Calls
              </span>
            </footer>
          </section>

          <aside className="wire-inspector">
            <header>
              <div>
                <span
                  className={`graph-kind kind-${selectedDefinition?.kind ?? (selectedFile ? 'file' : 'config')}`}
                >
                  {selectedDefinition?.kind ?? (selectedFile ? 'file' : 'resource')}
                </span>
                <h2>{selectedDefinition?.name ?? selectedFile ?? 'Resource'}</h2>
              </div>
              {selectedDefinition ? (
                <code>
                  {selectedFile}:{selectedDefinition.line}
                </code>
              ) : null}
            </header>
            <div className="wire-evidence">
              <div>
                <span>Evidence</span>
                <p>
                  {selectedDefinition
                    ? `${selectedDefinition.direction} ${selectedDefinition.kind}, extracted by ${selectedDefinition.evidence.extractionRule} with ${selectedDefinition.evidence.confidence} confidence.`
                    : `Static map of ${analysis.data.summary.scripts} scripts and ${analysis.data.summary.lines.toLocaleString()} lines.`}
                </p>
              </div>
              <div>
                <span>Connected relationships</span>
                {related.length ? (
                  <ul>
                    {related.slice(0, 20).map((edge) => (
                      <li key={`${edge.from}-${edge.kind}-${edge.to}`}>
                        <code>{edge.from.replace(/^\w+:/, '')}</code>
                        <span>{edge.kind}</span>
                        <code>{edge.to.replace(/^\w+:/, '')}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No statically provable relationships for this node.</p>
                )}
              </div>
              {selected?.warnings.length ? (
                <div className="wire-warnings">
                  <span>Unresolved evidence</span>
                  <ul>
                    {selected.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
