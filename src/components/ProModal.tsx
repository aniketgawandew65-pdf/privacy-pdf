import { useState, useEffect, type FormEvent } from 'react';
import { X, Sparkles, Check, Key, ShieldCheck, ArrowRight } from 'lucide-react';
import { getLicenseStatus, activateLicenseKey, deactivateLicense, openCheckout } from '../utils/license';

interface ProModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkoutUrl?: string;
}

function loadLemonScript(): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector('script[src*="lemon.js"]') || (window as any).createLemonSqueezy) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://assets.lemonsqueezy.com/lemon.js';
    script.async = true;
    script.onload = () => {
      (window as any).createLemonSqueezy?.();
      resolve();
    };
    script.onerror = () => {
      console.warn('Lemon.js blocked or offline. Falling back to direct window checkout.');
      resolve();
    };
    document.body.appendChild(script);
  });
}

export function ProModal({
  isOpen,
  onClose,
  checkoutUrl = 'https://purple1into1.lemonsqueezy.com/checkout/buy/a7d4dced-b466-44c8-ad32-70aa434f2206?embed=1',
}: ProModalProps) {
  const [licenseInput, setLicenseInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isPro, setIsPro] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');

  const syncLicense = () => {
    const status = getLicenseStatus();
    setIsPro(status.isPro);
    setLicenseKey(status.licenseKey || '');
  };

  useEffect(() => {
    if (isOpen) {
      syncLicense();
      loadLemonScript();
    }

    window.addEventListener('storage', syncLicense);
    return () => window.removeEventListener('storage', syncLicense);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleActivate = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!licenseInput.trim()) {
      setErrorMsg('Please enter your license key.');
      return;
    }

    const result = await activateLicenseKey(licenseInput.trim());

    if (result.success) {
      setSuccessMsg(result.message || 'Pro license activated successfully.');
      setLicenseInput('');
      syncLicense();
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setErrorMsg(result.message || 'Invalid or expired license key.');
    }
  };

  const handleDeactivate = () => {
    deactivateLicense();
    syncLicense();
    setSuccessMsg('License deactivated.');
  };

  const handleCheckout = async () => {
    setErrorMsg('');
    if (!navigator.onLine) {
      setErrorMsg('An active internet connection is required to complete checkout.');
      return;
    }
    await loadLemonScript();
    openCheckout(checkoutUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <style>{`
        @keyframes proShimmerSweep {
          0% { transform: translateX(-120%) skewX(-20deg); }
          30%, 100% { transform: translateX(250%) skewX(-20deg); }
        }
        @keyframes subtlePulse {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.02); }
        }
        .animate-pro-shimmer {
          animation: proShimmerSweep 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .animate-subtle-pulse {
          animation: subtlePulse 4s ease-in-out infinite;
        }
      `}</style>

      <div className="relative w-full max-w-md bg-zinc-950 border border-zinc-800/90 rounded-3xl p-6 sm:p-7 shadow-[0_0_50px_rgba(0,0,0,0.8)] text-left overflow-hidden">
        {/* Ambient Top Light Ray */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-36 bg-emerald-500/20 blur-3xl pointer-events-none rounded-full animate-subtle-pulse" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition cursor-pointer z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Badge */}
        <div className="relative z-10 flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shadow-inner">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-0.5">
              Annual Pro Pass
            </div>
            <h3 className="text-xl font-extrabold text-white tracking-tight">1into1 PDF Pro</h3>
          </div>
        </div>

        <p className="relative z-10 text-xs text-zinc-400 leading-relaxed mb-5">
          Everything unlocked. Runs entirely in your browser with zero data transfers.
        </p>

        {/* Pro Capabilities */}
        <div className="relative z-10 space-y-2.5 my-5 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 text-xs text-zinc-300">
          <div className="flex items-center gap-2.5">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Unlimited batching — merge, split & convert 50+ files</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>High-capacity documents up to 150MB</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Target KB size matching & precision downscaling</span>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Valid on up to 5 devices • Commercial use permitted</span>
          </div>
        </div>

        {isPro ? (
          <div className="relative z-10 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center mb-4">
            <p className="text-xs font-semibold text-emerald-400 flex items-center justify-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Pro License Active
            </p>
            <p className="text-[11px] font-mono text-zinc-400 mt-1 truncate">Key: {licenseKey}</p>
            <button
              onClick={handleDeactivate}
              className="mt-3 text-xs text-red-400 hover:text-red-300 underline cursor-pointer"
            >
              Deactivate License on This Device
            </button>
          </div>
        ) : (
          <div className="relative z-10">
            {/* Shimmer Flick CTA Button */}
            <div className="relative group mb-4">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-2xl blur-md opacity-40 group-hover:opacity-75 transition duration-300" />
              
              <button
                onClick={handleCheckout}
                className="relative w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 text-zinc-950 font-bold text-sm transition-all duration-200 flex items-center justify-between shadow-xl cursor-pointer overflow-hidden active:scale-[0.99]"
              >
                {/* The Shimmer Light Beam */}
                <span className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-20deg] pointer-events-none animate-pro-shimmer" />

                <div className="flex items-baseline gap-1.5 text-left">
                  <span className="text-lg font-black tracking-tight">$49</span>
                  <span className="text-xs font-semibold text-zinc-900/80">/ year</span>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-zinc-950">
                  <span>Get Pro Access</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5] transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            </div>

            {/* License Activation Form */}
            <form onSubmit={handleActivate} className="pt-4 border-t border-zinc-900">
              <label className="text-[11px] font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-zinc-500" />
                Already have a license key?
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste your license key..."
                  value={licenseInput}
                  onChange={(e) => setLicenseInput(e.target.value)}
                  className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition cursor-pointer"
                >
                  Activate
                </button>
              </div>

              {errorMsg && <p className="text-red-400 text-xs mt-2">{errorMsg}</p>}
              {successMsg && <p className="text-emerald-400 text-xs mt-2">{successMsg}</p>}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
