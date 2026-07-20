import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Ban,
  CheckCircle2,
  CircleDashed,
  LoaderCircle,
  PackageCheck,
  X,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { unwrap } from '../lib/result';
import {
  motionDurations,
  drawerSlide,
  overlayFade,
  transition,
  useReducedMotion,
} from '../lib/motion';
import { useWorkspaceStore } from '../store/workspace';

type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

function statusLabel(status: JobStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
  }
}

function JobStatusIcon({ status }: { status: JobStatus }): React.JSX.Element {
  if (status === 'running' || status === 'queued') {
    return <LoaderCircle className={status === 'running' ? 'is-spinning' : undefined} />;
  }
  if (status === 'completed') return <CheckCircle2 />;
  if (status === 'cancelled') return <CircleDashed />;
  return <XCircle />;
}

function formatRelativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const deltaSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (deltaSec < 5) return 'just now';
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const mins = Math.round(deltaSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

export function JobsPanel(): React.JSX.Element {
  const jobsOpen = useWorkspaceStore((state) => state.jobsOpen);
  const setJobs = useWorkspaceStore((state) => state.setJobs);
  const reduced = useReducedMotion();
  const query = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => unwrap(await window.cortex.jobs.list()),
    refetchInterval: jobsOpen ? 800 : false,
  });

  const jobs = query.data ?? [];
  const activeCount = jobs.filter(
    (job) => job.status === 'running' || job.status === 'queued',
  ).length;
  const doneCount = jobs.filter((job) => job.status === 'completed').length;
  const failedCount = jobs.filter(
    (job) => job.status === 'failed' || job.status === 'cancelled',
  ).length;

  const cancel = async (id: string) => {
    await window.cortex.jobs.cancel({ id });
    await query.refetch();
  };

  return (
    <Dialog.Root open={jobsOpen} onOpenChange={setJobs}>
      <AnimatePresence>
        {jobsOpen ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <m.div
                className="drawer-overlay"
                initial={reduced ? false : overlayFade.initial}
                animate={overlayFade.animate}
                exit={reduced ? overlayFade.animate : overlayFade.exit}
                transition={transition(motionDurations.panel, reduced)}
              />
            </Dialog.Overlay>
            <Dialog.Content
              className="jobs-drawer activity-panel"
              aria-describedby="activity-panel-desc"
            >
              <m.div
                className="jobs-drawer-motion"
                initial={reduced ? false : drawerSlide.initial}
                animate={drawerSlide.animate}
                exit={reduced ? drawerSlide.animate : drawerSlide.exit}
                transition={transition(motionDurations.panel, reduced)}
              >
                <header className="activity-header">
                  <div className="activity-header-copy">
                    <div className="activity-eyebrow">
                      <Activity aria-hidden="true" />
                      <span>Workspace</span>
                      {activeCount > 0 ? (
                        <span className="activity-live" aria-hidden="true">
                          <i />
                          Live
                        </span>
                      ) : null}
                    </div>
                    <Dialog.Title className="activity-title">Activity</Dialog.Title>
                    <Dialog.Description id="activity-panel-desc" className="activity-desc">
                      Background package builds, indexing, and conversions. Your workspace stays
                      usable while they run.
                    </Dialog.Description>
                  </div>
                  <Dialog.Close className="activity-close" aria-label="Close activity">
                    <X aria-hidden="true" />
                  </Dialog.Close>
                </header>

                {jobs.length > 0 ? (
                  <div className="activity-summary" aria-label="Job summary">
                    <div>
                      <strong>{activeCount}</strong>
                      <span>active</span>
                    </div>
                    <div>
                      <strong>{doneCount}</strong>
                      <span>done</span>
                    </div>
                    <div>
                      <strong>{failedCount}</strong>
                      <span>stopped</span>
                    </div>
                  </div>
                ) : null}

                <div className="job-list">
                  {jobs.length === 0 ? (
                    <div className="jobs-empty activity-empty">
                      <div className="activity-empty-icon" aria-hidden="true">
                        <PackageCheck />
                      </div>
                      <div>
                        <strong>Nothing running</strong>
                        <p>
                          Package builds, script indexing, and conversions show up here with stage,
                          progress, and output paths.
                        </p>
                      </div>
                      <ul className="activity-empty-hints">
                        <li>Release → dry run, then build</li>
                        <li>Validate or Script Analysis runs stay in-page</li>
                        <li>Cancel long jobs from this panel</li>
                      </ul>
                    </div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {jobs.map((job, index) => {
                        const started = formatRelativeTime(job.startedAt);
                        const finished = formatRelativeTime(job.finishedAt);
                        const timeLabel =
                          job.status === 'running' || job.status === 'queued'
                            ? started
                              ? `Started ${started}`
                              : 'Starting…'
                            : finished
                              ? `Finished ${finished}`
                              : null;
                        const progressPct =
                          job.progress !== null ? Math.round(job.progress * 100) : null;

                        return (
                          <m.article
                            className={`job activity-job status-${job.status}`}
                            key={job.id}
                            initial={reduced ? false : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
                            transition={{
                              ...transition(motionDurations.fast, reduced),
                              delay: reduced ? 0 : Math.min(index * 0.03, 0.12),
                            }}
                          >
                            <div className={`job-icon ${job.status}`} aria-hidden="true">
                              <JobStatusIcon status={job.status} />
                            </div>
                            <div className="activity-job-body">
                              <div className="job-title">
                                <strong>{job.displayName}</strong>
                                <span className={`activity-status-pill status-${job.status}`}>
                                  {statusLabel(job.status)}
                                </span>
                              </div>
                              <p className="activity-step">{job.currentStep}</p>
                              {timeLabel ? (
                                <small className="activity-meta">{timeLabel}</small>
                              ) : null}
                              {progressPct !== null ? (
                                <div
                                  className="activity-progress"
                                  role="progressbar"
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={progressPct}
                                  aria-label={`${progressPct}% complete`}
                                >
                                  <span
                                    className="activity-progress-fill"
                                    style={{ width: `${progressPct}%` }}
                                  />
                                </div>
                              ) : null}
                              {job.failure ? (
                                <small className="error activity-failure">{job.failure}</small>
                              ) : null}
                              {job.resultFiles.length > 0 ? (
                                <div className="activity-files">
                                  {job.resultFiles.map((file) => (
                                    <code key={file} title={file}>
                                      {file.split(/[\\/]/).at(-1) ?? file}
                                    </code>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            {job.cancellable ? (
                              <button
                                type="button"
                                className="activity-cancel compact"
                                onClick={() => void cancel(job.id)}
                              >
                                <Ban aria-hidden="true" />
                                Cancel
                              </button>
                            ) : null}
                          </m.article>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </div>
              </m.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
