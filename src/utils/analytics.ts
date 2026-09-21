type AnalyticsValue =
  | string
  | number
  | boolean;

type AnalyticsParams =
  Record<
    string,
    AnalyticsValue | undefined
  >;

declare global {
  interface Window {
    gtag?: (
      ...args: unknown[]
    ) => void;
  }
}

/*
 * Privacy-safe product analytics.
 *
 * Never send:
 * - file names
 * - document text/content
 * - email addresses
 * - license keys
 * - extracted data
 *
 * The existing GA4 bootstrap in index.html queues events before
 * the network script finishes loading, so callers can safely use
 * this helper during early interactions.
 */
export function trackAnalyticsEvent(
  eventName: string,
  params: AnalyticsParams = {}
): void {
  if (
    typeof window === 'undefined' ||
    typeof window.gtag !== 'function'
  ) {
    return;
  }

  const pagePath =
    window.location.pathname ||
    '/';

  const safeParams =
    Object.fromEntries(
      Object.entries(params)
        .filter(
          (
            entry
          ): entry is [
            string,
            AnalyticsValue,
          ] =>
            entry[1] !== undefined
        )
    );

  try {
    window.gtag(
      'event',
      eventName,
      {
        page_path:
          pagePath,
        ...safeParams,
      }
    );
  } catch {
    /*
     * Analytics must never interrupt a PDF workflow.
     */
  }
}
