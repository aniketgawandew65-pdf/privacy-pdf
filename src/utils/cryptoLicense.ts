/**
 * Zero-Server Cryptographic License Validator
 * Uses ECDSA (P-256 / SHA-256) via the native Web Crypto API.
 */

// Embedded ECDSA P-256 public key (SPKI format, base64-encoded)
// Replace with your generated public key when deploying your payment webhook
export const PUBLIC_KEY_SPKI_B64 =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+d1UeT6eGsh1/9yTzS8B2yZ5T1lX8Q0zWfK0q8eR6m+sK5uV8t3yH+Zg0m5Q0w8v7wP9q0k5t6y7u8i9o0p1qQ==';

export interface LicensePayload {
  email: string;
  type: 'lifetime' | 'subscription';
  issuedAt: string;
  expiresAt?: string | null;
}

export interface VerificationResult {
  valid: boolean;
  payload?: LicensePayload;
  error?: string;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function importPublicKey(spkiB64: string): Promise<CryptoKey> {
  const keyData = base64ToArrayBuffer(spkiB64);
  return await crypto.subtle.importKey(
    'spki',
    keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );
}

/**
 * Validates a signed license key string formatted as:
 * <base64UrlPayload>.<base64UrlSignature>
 */
export async function verifyLicenseKey(licenseKey: string): Promise<VerificationResult> {
  const cleanKey = licenseKey.trim();
  const parts = cleanKey.split('.');

  if (parts.length !== 2) {
    return { valid: false, error: 'Invalid license format. Expected payload.signature' };
  }

  const [payloadB64, sigB64] = parts;

  try {
    const rawPayloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload: LicensePayload = JSON.parse(rawPayloadJson);

    // Check expiration if subscription
    if (payload.expiresAt) {
      const expirationDate = new Date(payload.expiresAt);
      if (expirationDate < new Date()) {
        return { valid: false, error: 'License key has expired.' };
      }
    }

    // Verify ECDSA signature
    const publicKey = await importPublicKey(PUBLIC_KEY_SPKI_B64);
    const dataEncoder = new TextEncoder();
    const dataBuffer = dataEncoder.encode(payloadB64);
    const sigBuffer = base64ToArrayBuffer(sigB64);

    const isValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      publicKey,
      sigBuffer,
      dataBuffer
    );

    if (!isValid) {
      return { valid: false, error: 'Signature mismatch. License is invalid or forged.' };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Failed to verify cryptographic signature.' };
  }
}