import { useEffect, useState, useRef } from 'react';
import { X } from 'lucide-react';
import { networkAuditor } from '../utils/networkAuditor';
import { useDialogFocus } from '../utils/useDialogFocus';
interface Props { isOpen:boolean; onClose:()=>void; }
export function NetworkAuditDrawer({isOpen,onClose}:Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [stats,setStats] = useState({bytes:0,requests:0});
  useDialogFocus(ref,isOpen,onClose);
  useEffect(() => { networkAuditor.init(); }, []);
  useEffect(() => { if (!isOpen) return; return networkAuditor.subscribe((bytes,requests) => setStats({bytes,requests})); }, [isOpen]);
  if (!isOpen) return null;
  return <div className="dialog-backdrop" onClick={event => {if(event.target === event.currentTarget) onClose();}}><div ref={ref} className="pro-dialog" role="dialog" aria-modal="true" aria-labelledby="network-heading" tabIndex={-1}>
    <button className="icon-button dialog-close" aria-label="Close network activity" onClick={onClose}><X size={20}/></button>
    <div className="eyebrow">ON THIS PAGE</div><h2 id="network-heading">Network activity.</h2>
    <p className="pro-description">Local PDF tools process documents on your device. Optional AI and license checks make network requests.</p>
    <div className="pro-active"><strong>{stats.bytes.toLocaleString()} bytes of observed request bodies</strong><p>{stats.requests.toLocaleString()} observed requests</p></div>
    <p className="pro-fineprint">Counts include supported fetch, XMLHttpRequest and beacon calls since this page opened. They may include non-network data URLs and do not cover every browser, worker, asset or third-party request. This is a diagnostic counter, not proof of zero transmission.</p>
    <button className="primary-button" onClick={onClose}>Back to my document</button>
  </div></div>;
}
