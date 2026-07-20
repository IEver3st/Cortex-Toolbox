import { EventEmitter } from 'node:events';
import { z } from 'zod';

export const jobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']);
export const jobSchema = z.object({
  id: z.string(),
  type: z.string(),
  displayName: z.string(),
  status: jobStatusSchema,
  progress: z.number().min(0).max(1).nullable(),
  currentStep: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  logs: z.array(
    z.object({ at: z.string(), level: z.enum(['info', 'warn', 'error']), message: z.string() }),
  ),
  resultFiles: z.array(z.string()),
  failure: z.string().nullable(),
  cancellable: z.boolean(),
});
export type Job = z.infer<typeof jobSchema>;
export interface JobContext {
  signal: AbortSignal;
  stage(message: string, progress?: number): void;
  log(message: string, level?: 'info' | 'warn' | 'error'): void;
}

export class JobQueue extends EventEmitter {
  readonly #jobs = new Map<string, Job>();
  readonly #controllers = new Map<string, AbortController>();

  list(): Job[] {
    return [...this.#jobs.values()].sort((a, b) => b.id.localeCompare(a.id));
  }

  enqueue(
    type: string,
    displayName: string,
    work: (context: JobContext) => Promise<string[]>,
  ): Job {
    const id = `${Date.now().toString().padStart(13, '0')}-${crypto.randomUUID()}`;
    const controller = new AbortController();
    const job: Job = {
      id,
      type,
      displayName,
      status: 'queued',
      progress: null,
      currentStep: 'Waiting',
      startedAt: null,
      finishedAt: null,
      logs: [],
      resultFiles: [],
      failure: null,
      cancellable: true,
    };
    this.#jobs.set(id, job);
    this.#controllers.set(id, controller);
    this.emit('changed', job);
    void this.#run(job, controller, work);
    return job;
  }

  cancel(id: string): boolean {
    const job = this.#jobs.get(id);
    if (!job || !['queued', 'running'].includes(job.status)) return false;
    this.#controllers.get(id)?.abort();
    return true;
  }

  async #run(
    job: Job,
    controller: AbortController,
    work: (context: JobContext) => Promise<string[]>,
  ): Promise<void> {
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    job.currentStep = 'Starting';
    this.emit('changed', job);
    const update = (): void => {
      this.emit('changed', job);
    };
    try {
      const files = await work({
        signal: controller.signal,
        stage: (message, progress) => {
          job.currentStep = message;
          job.progress = progress ?? null;
          update();
        },
        log: (message, level = 'info') => {
          job.logs.push({ at: new Date().toISOString(), level, message });
          update();
        },
      });
      if (controller.signal.aborted) throw new DOMException('Job cancelled', 'AbortError');
      job.status = 'completed';
      job.progress = 1;
      job.currentStep = 'Complete';
      job.resultFiles = files;
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        job.status = 'cancelled';
        job.currentStep = 'Cancelled';
      } else {
        job.status = 'failed';
        job.currentStep = 'Failed';
        job.failure = error instanceof Error ? error.message : String(error);
      }
    } finally {
      job.finishedAt = new Date().toISOString();
      job.cancellable = false;
      this.#controllers.delete(job.id);
      update();
    }
  }
}
