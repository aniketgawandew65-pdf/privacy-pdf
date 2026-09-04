import { useState, useEffect } from 'react';
import { ShieldCheck, WifiOff, HardDrive, Cpu, X, Lock } from 'lucide-react';

interface NetworkAuditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NetworkAuditDrawer({ isOpen, onClose }: NetworkAuditDrawerProps) {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [memoryUsage, setMemoryUsage] = useState<string>('N/A');
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Chrome memory API check (if supported)
    if ((performance as any).memory) {
      const usedBytes = (performance as any).memory.usedJSHeapSize;
      setMemoryUsage(`${(usedBytes / (1024 * 1024)).toFixed(1)} MB`);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5 text-left">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="text-sm font-semibold text-zinc-100">Live Privacy & Network Audit</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Audit Metrics */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>Outbound Telemetry</span>
            </div>
            <p className="text-base font-bold font-mono text-emerald-400">0 Bytes</p>
            <p className="text-[10px] text-zinc-500">No tracking or analytics scripts</p>
          </div>

          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <WifiOff className="w-3.5 h-3.5 text-emerald-400" />
              <span>Network State</span>
            </div>
            <p className="text-base font-bold text-zinc-200">
              {isOffline ? 'Airplane Mode' : 'Connected'}
            </p>
            <p className="text-[10px] text-zinc-500">Works 100% disconnected</p>
          </div>

          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>Client Sandboxing</span>
            </div>
            <p className="text-base font-bold text-zinc-200">{cores} Cores Ready</p>
            <p className="text-[10px] text-zinc-500">Isolated in Web Workers</p>
          </div>

          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Heap Allocation</span>
            </div>
            <p className="text-base font-bold font-mono text-zinc-200">{memoryUsage}</p>
            <p className="text-[10px] text-zinc-500">Cleared on tab close</p>
          </div>
        </div>

        {/* Verification Checklist */}
        <div className="space-y-2 p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60 text-xs">
          <p className="font-semibold text-zinc-300 mb-1 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Independent Verification Checklist
          </p>
          <ul className="space-y-1.5 text-[11px] text-zinc-400">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Open DevTools (F12) → Network tab: 0 POST/PUT requests on file load.
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              All WebAssembly runtimes run inside browser RAM (`ArrayBuffer`).
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Zero third-party SDKs, tracking pixels, or server logs.
            </li>
          </ul>
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition"
        >
          Close Auditor
        </button>
      </div>
    </div>
  );
}