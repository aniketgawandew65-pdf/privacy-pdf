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
    <div className="inline-flex items-center gap-2 sm:gap-3 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-md text-emerald-400 text-[10px] sm:text-xs font-mono tracking-wide shadow-sm max-w-full truncate">
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 truncate">
        <span className="font-semibold text-emerald-300 truncate">
          {stats.bytesSent} BYTES TRANSMITTED
        </span>
        <span className="text-zinc-600">|</span>
        <span className="text-zinc-400 shrink-0">
          {stats.requestCount} UPLOADS
        </span>
      </div>

      {isZeroBytes && (
        <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-900/40 text-[10px] text-emerald-300 border border-emerald-700/40 shrink-0">
          <WifiOff className="w-3 h-3" /> 100% Client-Side
        </span>
      )}
    </div>
  );
};