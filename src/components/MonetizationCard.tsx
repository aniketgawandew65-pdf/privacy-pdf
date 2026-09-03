import React from 'react';
import { Shield, Coffee, ExternalLink } from 'lucide-react';

export const MonetizationCard: React.FC = () => {
  return (
    <div className="w-full max-w-xl mx-auto mt-8 p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 shrink-0">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-200">Value local-first privacy?</p>
          <p className="text-[11px] text-zinc-400 leading-tight mt-0.5">
            Keep your storage zero-knowledge with encrypted cloud backup.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
        {/* Contextual Affiliate Slot */}
        <a
          href="https://proton.me/drive"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors border border-zinc-700"
        >
          <span>Proton Drive</span>
          <ExternalLink className="w-3 h-3 text-zinc-400" />
        </a>

        {/* Direct Tip / Supporter Slot */}
        <a
          href="https://buymeacoffee.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium transition-colors border border-emerald-500/30"
        >
          <Coffee className="w-3 h-3" />
          <span>Tip $3</span>
        </a>
      </div>
    </div>
  );
};