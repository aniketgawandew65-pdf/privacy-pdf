import { useState, useRef, useEffect, useCallback } from "react";

export function useObjectUrl() {
  const [url, setUrl] = useState<string | null>(null);
  const activeUrlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    const urlToRevoke = activeUrlRef.current;
    if (urlToRevoke) {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(urlToRevoke);
        } catch {}
      }, 60000);
      activeUrlRef.current = null;
      setUrl(null);
    }
  }, []);

  const createUrl = useCallback((blob: Blob | MediaSource) => {
    const prevUrl = activeUrlRef.current;
    if (prevUrl) {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(prevUrl);
        } catch {}
      }, 60000);
    }
    const newUrl = URL.createObjectURL(blob);
    activeUrlRef.current = newUrl;
    setUrl(newUrl);
    return newUrl;
  }, []);

  useEffect(() => {
    return () => {
      const finalUrl = activeUrlRef.current;
      if (finalUrl) {
        setTimeout(() => {
          try {
            URL.revokeObjectURL(finalUrl);
          } catch {}
        }, 60000);
      }
    };
  }, []);

  return { url, createUrl, revoke };
}
