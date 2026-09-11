import { useState, useEffect, useRef, type FormEvent } from 'react';
import { X, Check, ArrowRight } from 'lucide-react';
import { getLicenseStatus, activateLicenseKey, deactivateLicense, CHECKOUT_URL } from '../utils/license';
import { useDialogFocus } from '../utils/useDialogFocus';

interface ProModalProps { isOpen: boolean; onClose: () => void; checkoutUrl?: string; }
export function ProModal({ isOpen, onClose, checkoutUrl = CHECKOUT_URL }: ProModalProps) {
  const [licenseInput, setLicenseInput] = useState('');
  const [message, setMessage] = useState('');
  const [hasError, setHasError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isPro, setIsPro] = useState(getLicenseStatus().isPro);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, isOpen, onClose);
  useEffect(() => {
    const sync = () => setIsPro(getLicenseStatus().isPro);
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [isOpen]);
  if (!isOpen) return null;
  const handleActivate = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const result = await activateLicenseKey(licenseInput.trim());
      setHasError(!result.success); setMessage(result.message);
      setIsPro(getLicenseStatus().isPro);
      if (result.success) setLicenseInput('');
    } catch { setHasError(true); setMessage('Unable to activate right now. Please try again.'); }
    finally { setBusy(false); }
  };
  const handleDeactivate = async () => {
    setBusy(true);
    try { await deactivateLicense(); setIsPro(false); setHasError(false); setMessage('This browser has been deactivated.'); }
    catch { setHasError(true); setMessage('Connect to the internet to release this activation, then try again.'); }
    finally { setBusy(false); }
  };
  return <div className="dialog-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div ref={dialogRef} className="pro-dialog" role="dialog" aria-modal="true" aria-labelledby="pro-heading" tabIndex={-1}>
      <button className="icon-button dialog-close" aria-label="Close pricing" onClick={onClose}><X size={20} /></button>
      <div className="eyebrow">A LITTLE MORE ROOM</div>
      <h2 id="pro-heading">Meet 1into1 Pro.</h2>
      <p className="pro-description">For the PDFs that need more. Keep your document processing on your own device.</p>
      <div className="pro-price"><strong>$49</strong><span>/ year</span></div>
      <ul className="pro-features">
        <li><Check size={17} />Unlimited tasks</li>
        <li><Check size={17} />Lightening fast results</li>
        <li><Check size={17} />All tools included</li>
      </ul>
      {isPro ? <div className="pro-active"><strong>{import.meta.env.DEV && getLicenseStatus().licenseKey === 'DEV' ? 'Development Pro is active' : 'Your Pro license is active'}</strong><p>Ready for your next document.</p><button className="quiet-button" onClick={handleDeactivate} disabled={busy}>Deactivate this browser</button></div> : <>
        <a className="primary-button checkout-shimmer" href={checkoutUrl} target="_blank" rel="noopener noreferrer"><span>Continue to checkout</span><ArrowRight size={16} /></a>
        <p className="pro-fineprint">Billed annually through Lemon Squeezy. Taxes, renewal and refund terms are shown at checkout. Cloud AI provider charges are separate.</p>
        <form className="license-form" onSubmit={handleActivate}>
          <label htmlFor="pro-license">Already purchased? Activate your license.</label>
          <div className="license-row"><input id="pro-license" value={licenseInput} onChange={e => setLicenseInput(e.target.value)} placeholder="Paste your license key" autoComplete="off" autoCapitalize="none" spellCheck={false} required /><button className="quiet-button" disabled={busy} type="submit">{busy ? 'Checking…' : 'Activate'}</button></div>
          <p className="pro-fineprint">Activation verifies your key with the license provider. No document is sent.</p>
        </form>
      </>}
      {message && <p className={hasError ? 'form-error' : 'form-success'} role={hasError ? 'alert' : 'status'}>{message}</p>}
     
    </div>
  </div>;
}
