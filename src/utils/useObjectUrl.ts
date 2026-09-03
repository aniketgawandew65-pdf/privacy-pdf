import { useState, useRef, useEffect, useCallback } from 'react';

export function useObjectUrl() {
  const [url, setUrl] = useState<string | null>(null);
  const activeUrlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
      setUrl(null);
    }
  }, []);

  const createUrl = useCallback((blob: Blob | File | null): string | null => {
    // Clean up existing allocation before creating a new one
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }

    if (!blob) {
      setUrl(null);
      return null;
    }

    const newUrl = URL.createObjectURL(blob);
    activeUrlRef.current = newUrl;
    setUrl(newUrl);
    return newUrl;
  }, []);

  // Guarantee revocation when the tool component unmounts
  useEffect(() => {
    return () => {
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
      }
    };
  }, []);

  return { url, createUrl, revoke };
}