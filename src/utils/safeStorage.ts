// Storage can be unavailable in private/restricted browsers. Keep the tools usable for that session.
const memory = new Map<string,string>();
export const safeStorage = {
  getItem(key:string): string | null { try { return localStorage.getItem(key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; } },
  setItem(key:string,value:string) { memory.set(key,value); try { localStorage.setItem(key,value); } catch { /* session-only fallback */ } },
  removeItem(key:string) { memory.delete(key); try { localStorage.removeItem(key); } catch { /* unavailable */ } },
};

/*
 * Sensitive temporary values such as third-party API keys
 * should never be persisted across browser sessions.
 */
const sessionMemory = new Map<string,string>();

export const safeSessionStorage = {
  getItem(key:string): string | null {
    try {
      return sessionStorage.getItem(key) ??
        sessionMemory.get(key) ??
        null;
    } catch {
      return sessionMemory.get(key) ?? null;
    }
  },

  setItem(key:string,value:string) {
    sessionMemory.set(key,value);

    try {
      sessionStorage.setItem(
        key,
        value
      );
    } catch {
      // In-memory fallback only.
    }
  },

  removeItem(key:string) {
    sessionMemory.delete(key);

    try {
      sessionStorage.removeItem(
        key
      );
    } catch {
      // Storage unavailable.
    }
  },
};
