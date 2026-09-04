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
    const detectedCores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    // Leave at least 1 core free for UI rendering thread
    this.maxConcurrency = customConcurrency || Math.max(1, Math.min(detectedCores - 1, 8));
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
    this.queue = [];
    this.activeCount = 0;
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

    this.activeCount++;
    this.onTaskUpdate?.({ id: task.id, status: 'processing' });

    try {
      const result = await task.run(task.input, this.abortController.signal);
      if (!this.abortController.signal.aborted) {
        this.onTaskUpdate?.({ id: task.id, status: 'completed', result });
      }
    } catch (err: any) {
      if (this.abortController.signal.aborted) {
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