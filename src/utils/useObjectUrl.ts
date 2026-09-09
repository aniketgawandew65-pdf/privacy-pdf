import { useState, useRef, useEffect, useCallback } from "react";

export function useObjectUrl() {
  const [url, setUrl] = useState<string | null>(null);
  const activeUrlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    const target = activeUrlRef.current;
    if (target) {
      setTimeout(() => {
        try { URL.revokeObjectURL(target); } catch {}
      }, 60000);
      activeUrlRef.current = null;
      setUrl(null);
    }
  }, []);

  const createUrl = useCallback((blob: Blob | MediaSource) => {
    const prev = activeUrlRef.current;
    if (prev) {
      setTimeout(() => {
        try { URL.revokeObjectURL(prev); } catch {}
      }, 60000);
    }
    const next = URL.createObjectURL(blob);
    activeUrlRef.current = next;
    setUrl(next);
    return next;
  }, []);

  useEffect(() => {
    return () => {
      const target = activeUrlRef.current;
      if (target) {
        setTimeout(() => {
          try { URL.revokeObjectURL(target); } catch {}
        }, 60000);
      }
    };
  }, []);

  return { url, createUrl, revoke };
}
