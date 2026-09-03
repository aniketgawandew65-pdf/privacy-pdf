import { useState } from 'react';
import { X, Sparkles, Check, Key, ShieldCheck } from 'lucide-react';
import { getLicenseStatus, activateLicenseKey, deactivateLicense, openCheckout } from '../utils/license';

interface ProModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkoutUrl?: string;
}

export function ProModal({
  isOpen,
  onClose,
  checkoutUrl = 'https://purple1into1.lemonsqueezy.com/checkout/buy/a7d4dced-b466-44c8-ad32-70aa434f2206?embed=1',
}: ProModalProps) {
  const [licenseInput, setLicenseInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const { isPro, licenseKey } = getLicenseStatus();

  if (!isOpen) return null;

  const handleActivate = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!licenseInput.trim()) {
      setErrorMsg('Please enter a valid license key.');
      return;
    }

    const success = activateLicenseKey(licenseInput);
    if (success) {
      setSuccessMsg('Pro license activated successfully!');
      setLicenseInput('');
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setErrorMsg('Invalid license key format.');
    }
  };

  const handleDeactivate = () => {
    deactivateLicense();
    setSuccessMsg('License deactivated.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl text-left">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2.5 mb-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">1into1 PDF Pro</h3>
            <p className="text-xs text-zinc-400">Unlock the complete offline privacy toolkit</p>
          </div>
        </div>

        {/* Pro Benefits */}
        <ul className="space-y-2.5 my-5 text-xs text-zinc-300">
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Unlimited batch file processing (merge 50+ PDFs at once)</span>
          </li>
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Precision target-size compression sliders (e.g. strict 100KB limits)</span>
          </li>
          <li className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>100% offline standalone license</span>
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Commercial-use license with zero tracking telemetry</span>
          </li>
        </ul>

        {isPro ? (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center mb-4">
            <p className="text-xs font-semibold text-emerald-400">Pro License Active</p>
            <p className="text-[11px] text-zinc-400 mt-0.5 truncate">Key: {licenseKey}</p>
            <button
              onClick={handleDeactivate}
              className="mt-3 text-xs text-red-400 hover:underline"
            >
              Deactivate License
            </button>
          </div>
        ) : (
          <>
            {/* Purchase CTA */}
            <button
              onClick={() => openCheckout(checkoutUrl)}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold transition shadow-lg shadow-emerald-500/20 mb-4"
            >
              Get Pro Access — $19
            </button>

            {/* License Input Form */}
            <form onSubmit={handleActivate} className="pt-4 border-t border-zinc-800">
              <label className="block text-xs font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                Already have a license key?
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste license key..."
                  value={licenseInput}
                  onChange={(e) => setLicenseInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white transition"
                >
                  Activate
                </button>
              </div>

              {errorMsg && <p className="text-red-400 text-xs mt-2">{errorMsg}</p>}
              {successMsg && <p className="text-emerald-400 text-xs mt-2">{successMsg}</p>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}