import { useQuery } from '@tanstack/react-query';
import { Bug, ExternalLink, Layers, Lightbulb, Send } from 'lucide-react';
import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';
import { toast } from 'sonner';
import type { ReportType } from '../../shared/contracts';
import { formatResultError } from '../lib/result';
import { Toggle } from './UiPrimitives';

const REPORT_TYPES: {
  value: ReportType;
  label: string;
  compactLabel: string;
  icon: typeof Bug;
}[] = [
  { value: 'bug', label: 'Bug report', compactLabel: 'Bug', icon: Bug },
  { value: 'feature', label: 'Feature request', compactLabel: 'Feature', icon: Lightbulb },
  { value: 'module', label: 'Module request', compactLabel: 'Module', icon: Layers },
];

const REPORT_COPY: Record<
  ReportType,
  {
    summaryPlaceholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    detailsLabel: string;
    detailsPlaceholder: string;
    detailsOptional: boolean;
    submitLabel: string;
    submitPendingLabel: string;
    contextTitle: string;
    contextDescription: string;
  }
> = {
  bug: {
    summaryPlaceholder: 'Example: Sentinel reports no files…',
    descriptionLabel: 'What happened',
    descriptionPlaceholder: 'Example: I opened a resource and expected its files to appear…',
    detailsLabel: 'Steps to reproduce',
    detailsPlaceholder: '1. Open…\n2. Choose…\n3. Observe…',
    detailsOptional: true,
    submitLabel: 'Submit bug report',
    submitPendingLabel: 'Submitting bug report…',
    contextTitle: 'Something is not working',
    contextDescription: 'Capture what broke and give the team a reliable path to reproduce it.',
  },
  feature: {
    summaryPlaceholder: 'Example: Export audit results to CSV…',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'Describe the feature and the problem it would solve…',
    detailsLabel: 'Use case',
    detailsPlaceholder:
      'Who needs this, when would they use it, and what outcome should it enable?',
    detailsOptional: true,
    submitLabel: 'Submit feature request',
    submitPendingLabel: 'Submitting feature request…',
    contextTitle: 'Shape the next workflow',
    contextDescription: 'Describe the problem and the outcome that would make your work easier.',
  },
  module: {
    summaryPlaceholder: 'Example: Vehicle tuning inspector…',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'Describe the module you want and what it should help developers do…',
    detailsLabel: 'Module details',
    detailsPlaceholder:
      'Include scope, workflows, integrations, and any examples from other tools if helpful.',
    detailsOptional: true,
    submitLabel: 'Submit module request',
    submitPendingLabel: 'Submitting module request…',
    contextTitle: 'Propose a new tool',
    contextDescription: 'Suggest a capability that would help resource developers move faster.',
  },
};

interface ReportFieldsProps {
  reportType: ReportType;
  active: boolean;
  configured: boolean;
  submitting: boolean;
  title: string;
  description: string;
  steps: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onStepsChange: (value: string) => void;
}

function ReportFields({
  reportType,
  active,
  configured,
  submitting,
  title,
  description,
  steps,
  onTitleChange,
  onDescriptionChange,
  onStepsChange,
}: ReportFieldsProps): React.JSX.Element {
  const copy = REPORT_COPY[reportType];
  const disabled = !active || !configured || submitting;
  const fieldId = (field: string) => `bug-report-${field}-${reportType}`;

  return (
    <div
      id={`bug-report-panel-${reportType}`}
      className={`bug-report-fields-panel${active ? ' is-active' : ''}`}
      role={active ? 'tabpanel' : undefined}
      aria-labelledby={`bug-report-tab-${reportType}`}
      aria-hidden={!active}
    >
      <label className="bug-report-field" htmlFor={fieldId('title')}>
        <span>Short summary</span>
        <input
          id={fieldId('title')}
          name={`bugReportTitle-${reportType}`}
          value={title}
          minLength={4}
          maxLength={120}
          placeholder={copy.summaryPlaceholder}
          autoComplete="off"
          disabled={disabled}
          required
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>
      <label className="bug-report-field" htmlFor={fieldId('description')}>
        <span>{copy.descriptionLabel}</span>
        <textarea
          id={fieldId('description')}
          name={`bugReportDescription-${reportType}`}
          value={description}
          minLength={10}
          maxLength={8_000}
          placeholder={copy.descriptionPlaceholder}
          autoComplete="off"
          disabled={disabled}
          required
          rows={5}
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
      </label>
      <label className="bug-report-field" htmlFor={fieldId('steps')}>
        <span>
          {copy.detailsLabel} {copy.detailsOptional ? <small>Optional</small> : null}
        </span>
        <textarea
          id={fieldId('steps')}
          name={`bugReportSteps-${reportType}`}
          value={steps}
          maxLength={8_000}
          placeholder={copy.detailsPlaceholder}
          autoComplete="off"
          disabled={disabled}
          rows={4}
          onChange={(event) => onStepsChange(event.target.value)}
        />
      </label>
    </div>
  );
}

export function BugReportForm(): React.JSX.Element {
  const status = useQuery({
    queryKey: ['bug-report-status'],
    queryFn: async () => {
      const result = await window.cortex.reports.status();
      if (!result.ok) throw new Error(formatResultError(result.error));
      return result.data;
    },
  });
  const [reportType, setReportType] = useState<ReportType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdIssue, setCreatedIssue] = useState<{ number: number; url: string } | null>(null);
  const [reportTypeDirection, setReportTypeDirection] = useState<'forward' | 'backward'>('forward');
  const reportTypeRefs = useRef<Partial<Record<ReportType, HTMLButtonElement | null>>>({});

  const configured = status.data?.configured ?? false;
  const copy = REPORT_COPY[reportType];
  const reportIndex = REPORT_TYPES.findIndex(({ value }) => value === reportType);
  const sliderStyle = { '--report-index': reportIndex } as CSSProperties;

  const selectReportType = (nextType: ReportType, moveFocus = false) => {
    if (nextType === reportType || !configured || submitting) return;
    const nextIndex = REPORT_TYPES.findIndex(({ value }) => value === nextType);
    setReportTypeDirection(nextIndex > reportIndex ? 'forward' : 'backward');
    setReportType(nextType);
    if (moveFocus) reportTypeRefs.current[nextType]?.focus();
  };

  const handleReportTypeKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % REPORT_TYPES.length;
    if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + REPORT_TYPES.length) % REPORT_TYPES.length;
    }
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = REPORT_TYPES.length - 1;
    if (nextIndex === currentIndex) return;

    event.preventDefault();
    const nextReportType = REPORT_TYPES[nextIndex];
    if (!nextReportType) return;
    selectReportType(nextReportType.value, true);
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await window.cortex.reports.submit({
        reportType,
        title,
        description,
        steps,
        includeDiagnostics,
      });
      if (!result.ok) throw new Error(formatResultError(result.error));
      setCreatedIssue({ number: result.data.issueNumber, url: result.data.issueUrl });
      setTitle('');
      setDescription('');
      setSteps('');
      toast.success(`GitHub issue #${result.data.issueNumber} created.`);
      await status.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create the GitHub issue.';
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const openIssue = async () => {
    if (!createdIssue) return;
    const result = await window.cortex.system.openExternal({ url: createdIssue.url });
    if (!result.ok) toast.error(formatResultError(result.error));
  };

  return (
    <form
      className="bug-report-form"
      data-report-type={reportType}
      onSubmit={(event) => void submit(event)}
    >
      <div className="bug-report-form-main">
        {!configured ? (
          <div className="bug-report-status" role="status">
            <div>
              <strong>GitHub reporting is unavailable</strong>
              <p>This build cannot send issues to GitHub.</p>
            </div>
            <span className="bug-report-status-state">
              <span aria-hidden="true" /> Unavailable
            </span>
          </div>
        ) : null}

        <div
          className="bug-report-type"
          role="tablist"
          aria-label="Issue type"
          aria-orientation="horizontal"
          style={sliderStyle}
        >
          <span className="bug-report-type-track" aria-hidden="true">
            <span className="bug-report-type-thumb" />
          </span>
          {REPORT_TYPES.map(({ value, label, compactLabel, icon: Icon }, index) => (
            <button
              key={value}
              ref={(element) => {
                reportTypeRefs.current[value] = element;
              }}
              id={`bug-report-tab-${value}`}
              type="button"
              role="tab"
              aria-selected={reportType === value}
              aria-controls={`bug-report-panel-${value}`}
              aria-label={label}
              tabIndex={reportType === value ? 0 : -1}
              className={reportType === value ? 'active' : ''}
              disabled={!configured || submitting}
              onClick={() => selectReportType(value)}
              onKeyDown={(event) => handleReportTypeKeyDown(event, index)}
            >
              <Icon aria-hidden="true" />
              <span className="bug-report-type-label">{label}</span>
              <span className="bug-report-type-label-compact" aria-hidden="true">
                {compactLabel}
              </span>
            </button>
          ))}
        </div>

        <div className="bug-report-type-context" key={reportType} aria-live="polite">
          <strong>{copy.contextTitle}</strong>
          <span>{copy.contextDescription}</span>
        </div>

        <div className="bug-report-fields-viewport">
          <div className={`bug-report-fields-track is-${reportTypeDirection}`} style={sliderStyle}>
            {REPORT_TYPES.map(({ value }) => (
              <ReportFields
                key={value}
                reportType={value}
                active={reportType === value}
                configured={configured}
                submitting={submitting}
                title={title}
                description={description}
                steps={steps}
                onTitleChange={setTitle}
                onDescriptionChange={setDescription}
                onStepsChange={setSteps}
              />
            ))}
          </div>
        </div>

        <div className="bug-report-diagnostics">
          <div className="bug-report-diagnostics-copy">
            <p className="bug-report-diagnostics-label">Attach diagnostic log</p>
            <p>
              Includes recent Cortex app events and runtime details. Project files are never
              attached, but messages can include local file paths.
            </p>
          </div>
          <Toggle
            id="bug-report-diagnostics"
            name="bugReportDiagnostics"
            checked={includeDiagnostics}
            disabled={!configured || submitting}
            ariaLabel="Attach diagnostic log"
            onChange={setIncludeDiagnostics}
          />
        </div>
        {submitError ? (
          <p className="bug-report-error" role="alert">
            {submitError}
          </p>
        ) : null}
        <div className="bug-report-actions">
          <button type="submit" className="primary" disabled={!configured || submitting}>
            <Send aria-hidden="true" />
            {submitting ? copy.submitPendingLabel : copy.submitLabel}
          </button>
          {createdIssue ? (
            <button type="button" className="text-button" onClick={() => void openIssue()}>
              <ExternalLink aria-hidden="true" /> Open issue #{createdIssue.number}
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
