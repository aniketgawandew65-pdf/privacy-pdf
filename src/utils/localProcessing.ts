/** No file bytes or PII in this marker. Reload must not erase a recoverable job. */
const RECOVERY_KEY = 'oneinto1-local-processing-recovery-v1';
export const hasRecoverableProcessing = () => {
  try { return sessionStorage.getItem(RECOVERY_KEY) === '1'; } catch { return false; }
};
export const preserveProcessingWorkspace = () => sessionStorage.setItem(RECOVERY_KEY, '1');
export const clearProcessingRecovery = () => sessionStorage.removeItem(RECOVERY_KEY);

let busy = false;
export async function exclusivelyProcess<T>(work: () => Promise<T>): Promise<T> {
  if (busy) throw new Error('Another local PDF operation is still running.');
  busy = true;
  try {
    const run = async () => { preserveProcessingWorkspace(); return await work(); };
    if (navigator.locks) {
      return await navigator.locks.request('oneinto1-pdf-processing', { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error('PDF processing is active in another tab.');
        return await run();
      });
    }
    return await run();
  } finally { busy = false; }
}

const identities = new WeakMap<Blob, Promise<string>>();
export const digestText = async (text: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');
/** Content identity using SHA-256 of fixed-size chunk digests, size and version.
 * Reads every byte once, sequentially, with at most a 1 MiB input per digest.
 * This is a versioned content fingerprint, not the standard whole-file SHA-256. */
export function localContentId(blob: Blob): Promise<string> {
  let pending = identities.get(blob);
  if (!pending) {
    pending = (async () => {
      const digests: string[] = [];
      for (let start = 0; start < blob.size; start += 1024 * 1024) {
        digests.push(hex(await crypto.subtle.digest('SHA-256', await blob.slice(start, start + 1024 * 1024).arrayBuffer())));
      }
      return await digestText(JSON.stringify(['chunk-sha256-v1', blob.size, digests]));
    })();
    identities.set(blob, pending);
    pending.catch(() => identities.delete(blob));
  }
  return pending;
}
