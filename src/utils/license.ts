// Global declaration for Lemon Squeezy SDK
declare global {
  interface Window {
    createLemonSqueezy?: () => void;
    LemonSqueezy?: {
      Url: {
        Open: (url: string) => void;
        Close: () => void;
      };
    };
  }
}

const LICENSE_STORAGE_KEY = '1into1_pdf_pro_license';

export interface LicenseStatus {
  isPro: boolean;
  licenseKey: string | null;
}

// Check if user currently has an active Pro license
export function getLicenseStatus(): LicenseStatus {
  const key = localStorage.getItem(LICENSE_STORAGE_KEY);
  return {
    isPro: Boolean(key && key.trim().length > 5),
    licenseKey: key,
  };
}

// Save and activate a license key locally
export function activateLicenseKey(key: string): boolean {
  const cleanKey = key.trim();
  if (cleanKey.length < 6) return false;

  localStorage.setItem(LICENSE_STORAGE_KEY, cleanKey);
  window.dispatchEvent(new Event('storage'));
  return true;
}

// Remove license (deactivate)
export function deactivateLicense(): void {
  localStorage.removeItem(LICENSE_STORAGE_KEY);
  window.dispatchEvent(new Event('storage'));
}

// Launch Lemon Squeezy overlay checkout modal
export function openCheckout(checkoutUrl: string): void {
  if (window.LemonSqueezy?.Url) {
    window.LemonSqueezy.Url.Open(checkoutUrl);
  } else {
    // Fallback if overlay hasn't loaded: open in a new tab
    window.open(checkoutUrl, '_blank');
  }
}