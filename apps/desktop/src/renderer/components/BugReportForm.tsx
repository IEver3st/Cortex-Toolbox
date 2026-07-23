import { useQuery } from '@tanstack/react-query';
import { Bug, ExternalLink, Layers, Lightbulb, Send } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import type { ReportType } from '../../shared/contracts';
import { formatResultError } from '../lib/result';
import { Toggle } from './UiPrimitives';

const REPORT_TYPES: {
  value: ReportType;
  label: string;
  icon: typeof Bug;
}[] = [
  { value: 'bug', label: 'Bug report', icon: Bug },
  { value: 'feature', label: 'Feature request', icon: Lightbulb },
  { value: 'module', label: 'Module request', icon: Layers },
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
  },
};

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

  const copy = REPORT_COPY[reportType];

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

  const configured = status.data?.configured ?? false;
  return (
    <form className="bug-report-form" onSubmit={(event) => void submit(event)}>
      <div className="bug-report-status" role="status">
        <div>
          <strong>
            {configured ? 'GitHub reporting is ready' : 'GitHub reporting is unavailable'}
          </strong>
          <p>
            {configured
              ? `New issues will be created in ${status.data?.repository}. ${status.data?.logCount ?? 0} session events are ready to attach.`
              : 'This build cannot send issues to GitHub.'}
          </p>
        </div>
        <span className={configured ? 'settings-status-pill' : 'settings-status-pill is-muted'}>
          {configured ? 'Ready' : 'Unavailable'}
        </span>
      </div>

      <div className="bug-report-type" role="tablist" aria-label="Issue type">
        {REPORT_TYPES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={reportType === value}
            className={reportType === value ? 'active' : ''}
            disabled={!configured || submitting}
            onClick={() => setReportType(value)}
          >
            <Icon aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <label className="bug-report-field" htmlFor="bug-report-title">
        <span>Short summary</span>
        <input
          id="bug-report-title"
          name="bugReportTitle"
          value={title}
          minLength={4}
          maxLength={120}
          placeholder={copy.summaryPlaceholder}
          autoComplete="off"
          disabled={!configured || submitting}
          required
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="bug-report-field" htmlFor="bug-report-description">
        <span>{copy.descriptionLabel}</span>
        <textarea
          id="bug-report-description"
          name="bugReportDescription"
          value={description}
          minLength={10}
          maxLength={8_000}
          placeholder={copy.descriptionPlaceholder}
          autoComplete="off"
          disabled={!configured || submitting}
          required
          rows={5}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <label className="bug-report-field" htmlFor="bug-report-steps">
        <span>
          {copy.detailsLabel} {copy.detailsOptional ? <small>Optional</small> : null}
        </span>
        <textarea
          id="bug-report-steps"
          name="bugReportSteps"
          value={steps}
          maxLength={8_000}
          placeholder={copy.detailsPlaceholder}
          autoComplete="off"
          disabled={!configured || submitting}
          rows={4}
          onChange={(event) => setSteps(event.target.value)}
        />
      </label>
      <div className="bug-report-diagnostics">
        <div className="bug-report-diagnostics-copy">
          <p className="bug-report-diagnostics-label">Attach diagnostic log</p>
          <p>
            Includes recent Cortex app events and runtime details. Project files are never attached,
            but messages can include local file paths.
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
    </form>
  );
}
