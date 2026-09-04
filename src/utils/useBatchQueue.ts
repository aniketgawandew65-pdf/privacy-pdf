import { useState, useRef, useCallback } from 'react';
import { HardwareWorkerPool, type BatchTask, type TaskProgress } from './workerPool';

export function useBatchQueue<TInput, TOutput>() {
  const [tasksState, setTasksState] = useState<Record<string, TaskProgress<TOutput>>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const poolRef = useRef<HardwareWorkerPool<TInput, TOutput> | null>(null);

  const startBatch = useCallback((tasks: BatchTask<TInput, TOutput>[]) => {
    setIsProcessing(true);
    const initialStates: Record<string, TaskProgress<TOutput>> = {};
    tasks.forEach((t) => {
      initialStates[t.id] = { id: t.id, status: 'pending' };
    });
    setTasksState(initialStates);

    const pool = new HardwareWorkerPool<TInput, TOutput>();
    poolRef.current = pool;

    pool.setListener((updatedTask) => {
      setTasksState((prev) => {
        const next = { ...prev, [updatedTask.id]: updatedTask };
        const allDone = Object.values(next).every(
          (t) => t.status === 'completed' || t.status === 'error' || t.status === 'aborted'
        );
        if (allDone) {
          setIsProcessing(false);
        }
        return next;
      });
    });

    pool.enqueue(tasks);
  }, []);

  const cancelBatch = useCallback(() => {
    poolRef.current?.cancelAll();
    setIsProcessing(false);
  }, []);

  return {
    tasksState,
    isProcessing,
    startBatch,
    cancelBatch,
  };
}