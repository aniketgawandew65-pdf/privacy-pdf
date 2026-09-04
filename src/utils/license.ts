import { verifyLicenseKey, type LicensePayload } from './cryptoLicense';

const LICENSE_STORAGE_KEY = 'one_into_one_license';

export interface StoredLicense {
  key: string;
  payload: LicensePayload;
  verifiedAt: string;
}

export function getLicenseStatus(): {
  isPro: boolean;
  payload?: LicensePayload;
  licenseKey?: string;
} {
  try {
    const raw = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (!raw) return { isPro: false };

    const parsed: StoredLicense = JSON.parse(raw);

    if (parsed.payload?.expiresAt) {
      if (new Date(parsed.payload.expiresAt) < new Date()) {
        localStorage.removeItem(LICENSE_STORAGE_KEY);
        return { isPro: false };
      }
    }

    return {
      isPro: true,
      payload: parsed.payload,
      licenseKey: parsed.key,
    };
  } catch {
    return { isPro: false };
  }
}

export function openCheckout(checkoutUrl?: string): void {
  const target =
    checkoutUrl ||
    'https://purple1into1.lemonsqueezy.com/checkout/buy/a7d4dced-b466-44c8-ad32-70aa434f2206?embed=1';

  if (typeof window !== 'undefined' && (window as any).LemonSqueezy) {
    (window as any).LemonSqueezy.Url.Open(target);
  } else {
    window.open(target, '_blank');
  }
}

export async function activateLicenseKey(key: string): Promise<{ success: boolean; message: string }> {
  const result = await verifyLicenseKey(key);

  if (!result.valid || !result.payload) {
    return {
      success: false,
      message: result.error || 'Invalid license key.',
    };
  }

  const record: StoredLicense = {
    key: key.trim(),
    payload: result.payload,
    verifiedAt: new Date().toISOString(),
  };

  localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(record));
  window.dispatchEvent(new Event('storage'));

  return {
    success: true,
    message: `License activated for ${result.payload.email} (${result.payload.type})`,
  };
}

export function deactivateLicense(): void {
  localStorage.removeItem(LICENSE_STORAGE_KEY);
  window.dispatchEvent(new Event('storage'));
}

export function canPerformTask(): boolean {
  if (getLicenseStatus().isPro) return true;
  return true;
}

export function incrementTaskUsage(): void {}