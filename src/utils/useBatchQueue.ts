import { useState, useRef, useCallback, useEffect } from 'react';
import { HardwareWorkerPool, type BatchTask, type TaskProgress } from './workerPool';

export function useBatchQueue<TInput, TOutput>() {
  const [tasksState, setTasksState] = useState<Record<string, TaskProgress<TOutput>>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const poolRef = useRef<HardwareWorkerPool<TInput, TOutput> | null>(null);

  const startBatch = useCallback((tasks: BatchTask<TInput, TOutput>[]) => {
    poolRef.current?.cancelAll();
    setIsProcessing(tasks.length > 0);
    const initialStates: Record<string, TaskProgress<TOutput>> = {};
    tasks.forEach((t) => {
      initialStates[t.id] = { id: t.id, status: 'pending' };
    });
    setTasksState(initialStates);

    const pool = new HardwareWorkerPool<TInput, TOutput>();
    poolRef.current = pool;
    const unfinished = new Set(tasks.map(task => task.id));

    pool.setListener((updatedTask) => {
      if (poolRef.current !== pool) return;
      if (['completed', 'error', 'aborted'].includes(updatedTask.status)) unfinished.delete(updatedTask.id);
      if (unfinished.size === 0) setIsProcessing(false);
      setTasksState(prev => ({ ...prev, [updatedTask.id]: updatedTask }));
    });

    pool.enqueue(tasks);
  }, []);

  const cancelBatch = useCallback(() => {
    poolRef.current?.cancelAll();
    setIsProcessing(false);
  }, []);

  useEffect(() => () => { poolRef.current?.setListener(() => {}); poolRef.current?.cancelAll(); }, []);

  return {
    tasksState,
    isProcessing,
    startBatch,
    cancelBatch,
  };
}
