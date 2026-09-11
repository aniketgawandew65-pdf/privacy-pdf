import { verifyLicenseKey, type LicensePayload } from './cryptoLicense';
import { safeStorage } from './safeStorage';

export const CHECKOUT_URL = 'https://purple1into1.lemonsqueezy.com/checkout/buy/a7d4dced-b466-44c8-ad32-70aa434f2206';
// Public product identifiers only. Never put a Lemon Squeezy API secret in browser code.
const PRODUCT_ID = Number(import.meta.env.VITE_LEMON_PRODUCT_ID || 1336868);
const VARIANT_ID = Number(import.meta.env.VITE_LEMON_VARIANT_ID || 0);
const LICENSE_STORAGE_KEY = 'one_into_one_license';
const OFFLINE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
export interface StoredLicense { key: string; payload: LicensePayload; verifiedAt: string; instanceId?: string; productId?: number; variantId?: number; provider?: 'lemon' | 'signed'; }
let verified: StoredLicense | null = null;
let generation = 0;
const proRequested =
  new URLSearchParams(window.location.search).get('pro') === 'true';

let devEnabled = proRequested;
function emit() { window.dispatchEvent(new Event('storage')); }
function readStored(): StoredLicense | null { try { return JSON.parse(safeStorage.getItem(LICENSE_STORAGE_KEY) || 'null'); } catch { return null; } }
function unexpired(record: StoredLicense) {
  const expires = record.payload?.expiresAt;
  return !expires || (Number.isFinite(Date.parse(expires)) && Date.parse(expires) > Date.now());
}
function matchesProduct(meta: { product_id?: number; variant_id?: number }) {
  return Boolean((PRODUCT_ID || VARIANT_ID) && (!PRODUCT_ID || meta.product_id === PRODUCT_ID) && (!VARIANT_ID || meta.variant_id === VARIANT_ID));
}
interface LemonResponse {
  activated?: boolean; valid?: boolean; deactivated?: boolean; error?: string;
  license_key?: { status: string; expires_at: string | null; created_at: string };
  instance?: { id: string };
  meta?: { product_id: number; variant_id: number; customer_email: string };
}
async function licenseRequest(action: 'validate' | 'activate' | 'deactivate', data: Record<string,string>): Promise<LemonResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://api.lemonsqueezy.com/v1/licenses/${action}`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data), signal: controller.signal });
    const result = await response.json() as LemonResponse;
    if (!response.ok && !result.error) throw new Error('The license provider is unavailable. Try again shortly.');
    return result;
  } finally { clearTimeout(timer); }
}
function save(record: StoredLicense) { verified = record; safeStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(record)); safeStorage.removeItem('pro_license_active'); emit(); }
export function getLicenseStatus(): { isPro: boolean; payload?: LicensePayload; licenseKey?: string } {
  if (devEnabled) return { isPro: true, licenseKey: 'DEV', payload: { email: 'development', type: 'lifetime', issuedAt: new Date().toISOString() } };
  if (!verified || !unexpired(verified)) return { isPro: false };
  if (verified.provider === 'lemon' && Date.now() - Date.parse(verified.verifiedAt) > OFFLINE_GRACE_MS) return { isPro: false };
  return { isPro: true, payload: verified.payload, licenseKey: verified.key };
}
export async function refreshLicense() {
  const token = ++generation; const record = readStored(); verified = null;
  if (!record || typeof record.key !== 'string' || !unexpired(record)) { emit(); return; }
  try {
    if (record.provider === 'lemon' && record.instanceId && matchesProduct({product_id:record.productId,variant_id:record.variantId})) {
      if (!navigator.onLine) {
        const elapsed = Date.now() - Date.parse(record.verifiedAt);
        if (elapsed >= 0 && elapsed < OFFLINE_GRACE_MS && token === generation) verified = record;
      } else {
        const result = await licenseRequest('validate', { license_key: record.key, instance_id: record.instanceId });
        if (token !== generation) return;
        if (result.valid && result.license_key?.status === 'active' && result.meta && matchesProduct(result.meta) && result.instance?.id === record.instanceId) {
          record.payload.expiresAt = result.license_key.expires_at; record.verifiedAt = new Date().toISOString();
          if (unexpired(record)) save(record);
        } else safeStorage.removeItem(LICENSE_STORAGE_KEY);
      }
    } else if (record.key.includes('.')) {
      const result = await verifyLicenseKey(record.key);
      if (token === generation && result.valid && result.payload) verified = { ...record, payload: result.payload, provider: 'signed' };
    }
  } catch { /* Keep access unverified on provider errors; do not trust an arbitrary browser flag. */ }
  if (token === generation) emit();
}
export async function activateLicenseKey(key: string): Promise<{success:boolean;message:string}> {
  const clean = key.trim();
  if (!clean) return { success:false, message:'Enter your license key.' };
  if (import.meta.env.DEV && clean.toUpperCase() === 'DEV') { generation++; devEnabled = true; emit(); return {success:true,message:'Development Pro is active for this session.'}; }
  try {
    if (clean.includes('.')) {
      const result = await verifyLicenseKey(clean);
      if (!result.valid || !result.payload) return { success:false, message:result.error || 'This license could not be verified.' };
      generation++; save({key:clean,payload:result.payload,verifiedAt:new Date().toISOString(),provider:'signed'});
    } else {
      if (!(PRODUCT_ID || VARIANT_ID)) return {success:false,message:'License activation is not configured for this product yet. Please contact the site owner.'};
      if (!navigator.onLine) return {success:false,message:'Connect to the internet to activate your license.'};
      const previous = readStored();
      if (previous?.key === clean && previous.instanceId) {
        await refreshLicense();
        if (getLicenseStatus().isPro) return {success:true,message:'Your Pro license is already active.'};
      }
      const check = await licenseRequest('validate', {license_key:clean});
      if (!check.valid || !check.meta || !matchesProduct(check.meta)) return {success:false,message:check.error || 'This key is not valid for 1into1 PDF.'};
      const result = await licenseRequest('activate', {license_key:clean,instance_name:'1into1 PDF browser'});
      if (!result.activated || !result.instance || !result.license_key || !result.meta || !matchesProduct(result.meta)) return {success:false,message:result.error || 'Unable to activate this license.'};
      const record: StoredLicense = { key:clean,provider:'lemon',instanceId:result.instance.id,productId:result.meta.product_id,variantId:result.meta.variant_id,verifiedAt:new Date().toISOString(),payload:{email:result.meta.customer_email,type:result.license_key.expires_at ? 'subscription' : 'lifetime',issuedAt:result.license_key.created_at,expiresAt:result.license_key.expires_at} };
      if (!unexpired(record)) return {success:false,message:'This license has expired.'};
      generation++; save(record);
    }
    return {success:true,message:'Pro activated. You’re ready to go.'};
  } catch { return {success:false,message:'Could not reach the license provider. Check your connection and try again.'}; }
}
export async function deactivateLicense(): Promise<void> {
  const record = verified || readStored();
  if (!devEnabled && record?.provider === 'lemon' && record.instanceId) {
    const result = await licenseRequest('deactivate', {license_key:record.key,instance_id:record.instanceId});
    if (!result.deactivated) throw new Error(result.error || 'Could not release activation.');
  }
  generation++; devEnabled = false; verified = null; safeStorage.removeItem(LICENSE_STORAGE_KEY); safeStorage.removeItem('pro_license_active'); emit();
}
export function openCheckout(checkoutUrl = CHECKOUT_URL): void { window.open(checkoutUrl, '_blank', 'noopener,noreferrer'); }
export function canPerformTask(): boolean { return true; }
export function incrementTaskUsage(): void { /* Legacy API; compression uses usageTracker. */ }
