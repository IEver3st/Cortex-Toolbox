import type { ProbeCategory, ProbeConfidence, ProbeSeverity } from '@cortex/script-analysis';
import { AlertCircle, AlertTriangle, Info, Search } from 'lucide-react';

export type SeverityFilter = 'all' | ProbeSeverity;
export type CategoryFilter = 'all' | ProbeCategory | 'reviewed';
export type SortMode = 'severity' | 'file';
export type GroupMode = 'severity' | 'none';
export type ConfidenceFilter = 'all' | ProbeConfidence;
export type DeltaFilter = 'all' | 'new' | 'unchanged' | 'resolved';

export const STAGE_DEFS = [
  { id: 'discover', label: 'Discovering scripts' },
  { id: 'parse', label: 'Parsing source' },
  { id: 'references', label: 'Building static references' },
  { id: 'performance', label: 'Running performance rules' },
  { id: 'events', label: 'Checking event patterns' },
  { id: 'unused', label: 'Inspecting potential unused content' },
  { id: 'consolidate', label: 'Consolidating findings' },
] as const;

export const NAV_AREAS: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All findings' },
  { id: 'performance', label: 'Performance' },
  { id: 'event-safety', label: 'Event safety' },
  { id: 'reliability', label: 'Reliability' },
  { id: 'unused', label: 'Unused content' },
  { id: 'maintainability', label: 'Maintainability' },
  { id: 'manual-review', label: 'Manual review' },
  { id: 'reviewed', label: 'Reviewed / suppressed' },
];

export const SEVERITY_ORDER: ProbeSeverity[] = ['high', 'medium', 'low', 'info'];

export const SEVERITY_META: Record<
  ProbeSeverity,
  { label: string; short: string; badge: string; Icon: typeof AlertCircle }
> = {
  high: { label: 'High', short: 'High', badge: 'error', Icon: AlertCircle },
  medium: { label: 'Medium', short: 'Medium', badge: 'warning', Icon: AlertTriangle },
  low: { label: 'Low', short: 'Low', badge: 'neutral', Icon: Info },
  info: { label: 'Info', short: 'Info', badge: 'neutral', Icon: Info },
};

export const CATEGORY_LABEL: Record<ProbeCategory, string> = {
  performance: 'Performance',
  'event-safety': 'Event safety',
  reliability: 'Reliability',
  unused: 'Unused content',
  maintainability: 'Maintainability',
  'manual-review': 'Manual review',
};

export const CONFIDENCE_LABEL: Record<ProbeConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

export const RULE_CATEGORIES = [
  'Performance',
  'Event safety',
  'Reliability',
  'Unused content',
  'Maintainability',
  'Manual review',
] as const;

export { Search };
