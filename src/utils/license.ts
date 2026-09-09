import { verifyLicenseKey, type LicensePayload } from './cryptoLicense';

const LICENSE_STORAGE_KEY = 'one_into_one_license';

export interface StoredLicense {
  key: string;
  payload: LicensePayload;
  verifiedAt: string;
}

// Auto-activate developer unlimited mode via URL parameter
if (typeof window !== 'undefined') {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pro') === 'true' || params.get('dev') === 'true') {
      const devRecord: StoredLicense = {
        key: 'DEV',
        payload: { email: 'developer@1into1.com', type: 'lifetime' } as any,
        verifiedAt: new Date().toISOString(),
      };
      localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(devRecord));
      localStorage.setItem('pro_license_active', 'true');
    }
  } catch {}
}

export function getLicenseStatus(): {
  isPro: boolean;
  payload?: LicensePayload;
  licenseKey?: string;
} {
  try {
    if (localStorage.getItem('pro_license_active') === 'true') {
      return {
        isPro: true,
        payload: { email: 'developer@1into1.com', type: 'lifetime' } as any,
        licenseKey: 'DEV',
      };
    }

    const raw = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (!raw) return { isPro: false };

    const parsed: StoredLicense = JSON.parse(raw);

    if (parsed.payload?.expiresAt) {
      if (new Date(parsed.payload.expiresAt) < new Date()) {
        localStorage.removeItem(LICENSE_STORAGE_KEY);
        localStorage.removeItem('pro_license_active');
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
  const clean = (key || '').trim().toUpperCase();

  // Instant Developer Bypass
  if (clean === 'DEV' || clean === 'ADMIN' || clean === 'PRO' || clean === 'TEST') {
    const record: StoredLicense = {
      key: clean,
      payload: { email: 'developer@1into1.com', type: 'lifetime' } as any,
      verifiedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(record));
      localStorage.setItem('pro_license_active', 'true');
      window.dispatchEvent(new Event('storage'));
    } catch {}
    return {
      success: true,
      message: 'Developer Pro activated! Unlimited tasks unlocked.',
    };
  }

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
  localStorage.setItem('pro_license_active', 'true');
  window.dispatchEvent(new Event('storage'));

  return {
    success: true,
    message: `License activated for ${result.payload.email} (${result.payload.type})`,
  };
}

export function deactivateLicense(): void {
  localStorage.removeItem(LICENSE_STORAGE_KEY);
  localStorage.removeItem('pro_license_active');
  window.dispatchEvent(new Event('storage'));
}

export function canPerformTask(): boolean {
  return true;
}

export function incrementTaskUsage(): void {}