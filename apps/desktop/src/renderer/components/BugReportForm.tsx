import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Send } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { formatResultError } from '../lib/result';
import { Toggle } from './UiPrimitives';

export function BugReportForm(): React.JSX.Element {
  const status = useQuery({
    queryKey: ['bug-report-status'],
    queryFn: async () => {
      const result = await window.cortex.reports.status();
      if (!result.ok) throw new Error(formatResultError(result.error));
      return result.data;
    },
  });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdIssue, setCreatedIssue] = useState<{ number: number; url: string } | null>(null);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await window.cortex.reports.submit({
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
            {configured ? 'GitHub reporting is ready' : 'GitHub reporting needs configuration'}
          </strong>
          <p>
            {configured
              ? `New issues will be created in ${status.data?.repository}. ${status.data?.logCount ?? 0} session events are ready to attach.`
              : 'Set CORTEX_GITHUB_OWNER, CORTEX_GITHUB_REPOSITORY, and CORTEX_GITHUB_REPORT_TOKEN, then restart Cortex.'}
          </p>
        </div>
        <span className={configured ? 'settings-status-pill' : 'settings-status-pill is-muted'}>
          {configured ? 'Ready' : 'Not configured'}
        </span>
      </div>

      <label className="bug-report-field" htmlFor="bug-report-title">
        <span>Short summary</span>
        <input
          id="bug-report-title"
          name="bugReportTitle"
          value={title}
          minLength={4}
          maxLength={120}
          placeholder="Example: Sentinel reports no files…"
          autoComplete="off"
          disabled={!configured || submitting}
          required
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="bug-report-field" htmlFor="bug-report-description">
        <span>What happened</span>
        <textarea
          id="bug-report-description"
          name="bugReportDescription"
          value={description}
          minLength={10}
          maxLength={8_000}
          placeholder="Example: I opened a resource and expected its files to appear…"
          autoComplete="off"
          disabled={!configured || submitting}
          required
          rows={5}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <label className="bug-report-field" htmlFor="bug-report-steps">
        <span>
          Steps to reproduce <small>Optional</small>
        </span>
        <textarea
          id="bug-report-steps"
          name="bugReportSteps"
          value={steps}
          maxLength={8_000}
          placeholder={'1. Open…\n2. Choose…\n3. Observe…'}
          autoComplete="off"
          disabled={!configured || submitting}
          rows={4}
          onChange={(event) => setSteps(event.target.value)}
        />
      </label>
      <label className="bug-report-diagnostics" htmlFor="bug-report-diagnostics">
        <div>
          <strong>Attach diagnostic log</strong>
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
      </label>
      {submitError ? (
        <p className="bug-report-error" role="alert">
          {submitError}
        </p>
      ) : null}
      <div className="bug-report-actions">
        <button type="submit" className="is-primary" disabled={!configured || submitting}>
          <Send aria-hidden="true" /> {submitting ? 'Creating issue…' : 'Create GitHub issue'}
        </button>
        {createdIssue ? (
          <button type="button" onClick={() => void openIssue()}>
            <ExternalLink aria-hidden="true" /> Open issue #{createdIssue.number}
          </button>
        ) : null}
      </div>
    </form>
  );
}
