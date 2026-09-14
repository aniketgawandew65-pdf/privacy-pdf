export interface BatchTask<TInput, TOutput> {
  id: string;
  input: TInput;
  run: (input: TInput, signal: AbortSignal) => Promise<TOutput>;
}

export interface TaskProgress<TOutput> {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'aborted';
  progress?: number;
  result?: TOutput;
  error?: string;
}

export class HardwareWorkerPool<TInput, TOutput> {
  private maxConcurrency: number;
  private queue: BatchTask<TInput, TOutput>[] = [];
  private activeCount = 0;
  private abortController: AbortController = new AbortController();
  private onTaskUpdate?: (status: TaskProgress<TOutput>) => void;

  constructor(customConcurrency?: number) {
    /*
     * PDF/image/OCR tasks can consume hundreds of MB once
     * decoded into canvases, PDF.js structures and output
     * buffers.
     *
     * Serial processing is therefore the safe default.
     * This prevents two large jobs from overlapping on
     * mobile and also protects desktop browsers during
     * near-150 MB workloads.
     *
     * A caller may still explicitly opt into higher
     * concurrency for known-lightweight work.
     */
    this.maxConcurrency =
      customConcurrency === undefined
        ? 1
        : Math.max(
            1,
            Math.floor(
              customConcurrency
            )
          );
  }

  public setListener(listener: (status: TaskProgress<TOutput>) => void) {
    this.onTaskUpdate = listener;
  }

  public enqueue(tasks: BatchTask<TInput, TOutput>[]) {
    this.abortController = new AbortController();
    this.queue.push(...tasks);
    tasks.forEach((t) => {
      this.onTaskUpdate?.({ id: t.id, status: 'pending' });
    });
    this.processNext();
  }

  public cancelAll() {
    this.abortController.abort();
    this.queue.forEach(task => this.onTaskUpdate?.({ id: task.id, status: 'aborted' }));
    this.queue = [];
  }

  private async processNext() {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    if (this.abortController.signal.aborted) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    const signal = this.abortController.signal;
    this.activeCount++;
    this.onTaskUpdate?.({ id: task.id, status: 'processing' });

    try {
      const result = await task.run(task.input, signal);
      if (!signal.aborted) {
        this.onTaskUpdate?.({ id: task.id, status: 'completed', result });
      } else {
        this.onTaskUpdate?.({ id: task.id, status: 'aborted' });
      }
    } catch (err: any) {
      if (signal.aborted) {
        this.onTaskUpdate?.({ id: task.id, status: 'aborted' });
      } else {
        this.onTaskUpdate?.({
          id: task.id,
          status: 'error',
          error: err?.message || 'Processing failed',
        });
      }
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }
}