import React, { useEffect, useState } from 'react';
import { ShieldCheck, WifiOff } from 'lucide-react';
import { networkAuditor } from '../utils/networkAuditor';

export const TrustBadge: React.FC = () => {
  const [stats, setStats] = useState({ bytesSent: 0, requestCount: 0 });

  useEffect(() => {
    const unsubscribe = networkAuditor.subscribe((bytesSent, requestCount) => {
      setStats({ bytesSent, requestCount });
    });
    return () => unsubscribe();
  }, []);

  const isZeroBytes = stats.bytesSent === 0;

  return (
    <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-md text-emerald-400 text-xs font-mono tracking-wide shadow-sm">
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
      </div>

      <div className="flex items-center gap-2">
        <span className="font-semibold text-emerald-300">
          {stats.bytesSent} BYTES TRANSMITTED
        </span>
        <span className="text-zinc-500">|</span>
        <span className="text-zinc-400">
          {stats.requestCount} UPLOADS
        </span>
      </div>

      {isZeroBytes && (
        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-900/40 text-[10px] text-emerald-300 border border-emerald-700/40">
          <WifiOff className="w-3 h-3" /> 100% Client-Side
        </span>
      )}
    </div>
  );
};