import { Cpu, CheckCircle2, AlertCircle, Loader2, StopCircle, Archive } from 'lucide-react';
import type { TaskProgress } from '../utils/workerPool';

interface BatchQueueDrawerProps<TOutput> {
  tasks: Record<string, TaskProgress<TOutput>>;
  isProcessing: boolean;
  onCancel: () => void;
  onDownloadAll?: () => void;
  title?: string;
}

export function BatchQueueDrawer<TOutput>({
  tasks,
  isProcessing,
  onCancel,
  onDownloadAll,
  title = 'Multi-Core Batch Processor',
}: BatchQueueDrawerProps<TOutput>) {
  const taskList = Object.values(tasks);
  if (taskList.length === 0) return null;

  const completedCount = taskList.filter((t) => t.status === 'completed').length;
  const errorCount = taskList.filter((t) => t.status === 'error').length;
  const totalCount = taskList.length;
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;

  return (
    <div className="w-full bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 text-left space-y-4">
      {/* Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-zinc-200">{title}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
            {cores} CPU Cores Active
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isProcessing && (
            <button
              onClick={onCancel}
              className="px-2.5 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-800/50 text-[11px] font-medium text-red-300 flex items-center gap-1.5 transition"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>Cancel Queue</span>
            </button>
          )}

          {!isProcessing && completedCount > 0 && onDownloadAll && (
            <button
              onClick={onDownloadAll}
              className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-semibold flex items-center gap-1.5 transition shadow"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Download ZIP ({completedCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Summary */}
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>
          Processed: {completedCount} / {totalCount} {errorCount > 0 ? `(${errorCount} failed)` : ''}
        </span>
        <span className="text-emerald-400 font-mono">
          {Math.round((completedCount / totalCount) * 100)}%
        </span>
      </div>

      <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-emerald-500 h-full transition-all duration-300"
          style={{ width: `${(completedCount / totalCount) * 100}%` }}
        />
      </div>

      {/* Task Rows */}
      <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 text-xs">
        {taskList.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50 border border-zinc-900"
          >
            <span className="truncate max-w-[70%] text-zinc-300">{item.id}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {item.status === 'processing' && (
                <span className="flex items-center gap-1 text-amber-400 text-[11px]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Processing
                </span>
              )}
              {item.status === 'completed' && (
                <span className="flex items-center gap-1 text-emerald-400 text-[11px]">
                  <CheckCircle2 className="w-3 h-3" /> Done
                </span>
              )}
              {item.status === 'error' && (
                <span className="flex items-center gap-1 text-red-400 text-[11px]" title={item.error}>
                  <AlertCircle className="w-3 h-3" /> Failed
                </span>
              )}
              {item.status === 'pending' && (
                <span className="text-zinc-500 text-[11px]">Queued</span>
              )}
              {item.status === 'aborted' && (
                <span className="text-zinc-500 text-[11px]">Cancelled</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}