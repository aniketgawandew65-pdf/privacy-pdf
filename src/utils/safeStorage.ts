// Storage can be unavailable in private/restricted browsers. Keep the tools usable for that session.
const memory = new Map<string,string>();
export const safeStorage = {
  getItem(key:string): string | null { try { return localStorage.getItem(key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; } },
  setItem(key:string,value:string) { memory.set(key,value); try { localStorage.setItem(key,value); } catch { /* session-only fallback */ } },
  removeItem(key:string) { memory.delete(key); try { localStorage.removeItem(key); } catch { /* unavailable */ } },
};
