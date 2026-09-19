import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  getDeviceCapabilitySnapshot,
  type DeviceCapabilitySnapshot,
} from '../utils/deviceCapability';

import {
  calculateDesktopCapacity,
  type DesktopCapacityRecommendation,
} from '../utils/desktopCapacityCalculator';

interface UseDesktopCapacityRecommendationInput {
  toolId: string;

  selectedBytes: number;

  pageCount?: number | null;

  totalPixels?: number | null;

  estimatedRequiredStorageBytes?:
    number | null;

  enabled: boolean;
}

interface UseDesktopCapacityRecommendationResult {
  recommendation:
    | DesktopCapacityRecommendation
    | null;

  snapshot:
    | DeviceCapabilitySnapshot
    | null;

  loading: boolean;
}

/**
 * Shared Desktop Pro capacity hook.
 *
 * Responsibilities:
 * - Capture a fresh device/browser capability snapshot
 *   when the tool is active for Pro.
 * - Feed current workload signals into the shared
 *   Desktop capacity calculator.
 * - Return null when disabled.
 * - Let the calculator itself mark mobile/tablet
 *   environments as not applicable.
 *
 * This hook does NOT:
 * - allow/block uploads
 * - modify credits
 * - modify mobile limits
 * - modify any processing engine
 */
export function useDesktopCapacityRecommendation({
  toolId,
  selectedBytes,
  pageCount = null,
  totalPixels = null,
  estimatedRequiredStorageBytes = null,
  enabled,
}: UseDesktopCapacityRecommendationInput):
UseDesktopCapacityRecommendationResult {
  const [
    snapshot,
    setSnapshot,
  ] = useState<
    DeviceCapabilitySnapshot | null
  >(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setSnapshot(null);
      setLoading(false);

      return () => {
        cancelled = true;
      };
    }

    setLoading(true);

    void getDeviceCapabilitySnapshot()
      .then((nextSnapshot) => {
        if (!cancelled) {
          setSnapshot(
            nextSnapshot
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSnapshot(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    toolId,
  ]);

  const recommendation =
    useMemo(
      () => {
        if (
          !enabled ||
          !snapshot
        ) {
          return null;
        }

        return calculateDesktopCapacity(
          snapshot,
          toolId,
          {
            selectedBytes:
              Math.max(
                0,
                selectedBytes
              ),

            pageCount,

            totalPixels,

            estimatedRequiredStorageBytes,
          }
        );
      },
      [
        enabled,
        snapshot,
        toolId,
        selectedBytes,
        pageCount,
        totalPixels,
        estimatedRequiredStorageBytes,
      ]
    );

  return {
    recommendation,
    snapshot,
    loading,
  };
}
