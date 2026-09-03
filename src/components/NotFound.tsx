import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export function NotFound() {
  return (
    <div className="w-full max-w-md mx-auto p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center space-y-4">
      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
        <FileQuestion className="w-6 h-6" />
      </div>

      <div>
        <h2 className="text-xl font-bold text-white">404 - Page Not Found</h2>
        <p className="text-xs text-zinc-400 mt-1">
          The tool or link you requested does not exist or has been moved.
        </p>
      </div>

      <Link
        to="/"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Return to Home
      </Link>
    </div>
  );
}