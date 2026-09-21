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
 * Shared Desktop capacity hook.
 *
 * Responsibilities:
 * - Capture a fresh device/browser capability snapshot
 *   when a workload is selected on Desktop.
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
  /*
   * Capacity guidance now belongs to the Desktop processing
   * experience itself, not to the paid entitlement.
   *
   * Existing callers still pass their historical Pro-gated
   * `enabled` flag. Treat a real selected workload as active
   * regardless of that old entitlement flag. Mobile/tablet
   * remains suppressed by the calculator itself.
   */
  const capacityEnabled =
    selectedBytes > 0 ||
    enabled;

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

    if (!capacityEnabled) {
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
    capacityEnabled,
    toolId,
  ]);

  const recommendation =
    useMemo(
      () => {
        if (
          !capacityEnabled ||
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
        capacityEnabled,
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
