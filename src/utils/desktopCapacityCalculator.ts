/**
 * 1into1 PDF — Desktop Capacity Calculator
 *
 * PHASE 3A
 *
 * Combines:
 * - device/browser capability
 * - audited tool capacity profile
 * - optional selected workload complexity
 *
 * Produces:
 * - recommended Desktop workload size
 * - Green / Amber / Red assessment
 *
 * IMPORTANT:
 * This module does NOT:
 * - remove the existing 150 MB limit
 * - alter mobile/tablet safety behavior
 * - allow or block uploads
 * - modify task credits
 * - modify any PDF tool
 * - modify UI
 */

import {
  assessWorkload,
  type CapabilityConfidence,
  type CapabilityTier,
  type DeviceCapabilitySnapshot,
  type WorkloadAssessment,
} from './deviceCapability';

import {
  getToolCapacityProfile,
  type DesktopLargeFileReadiness,
  type OutputGrowth,
  type ProcessingClass,
  type RecoveryMode,
  type ResourceIntensity,
  type ToolCapacityProfile,
} from './toolCapacityProfiles';

const MB = 1024 * 1024;

/*
 * Baseline recommendation by detected desktop capability.
 *
 * These are recommendation starting points, not claims
 * that every document of this size will succeed.
 */
const BASE_RECOMMENDATION_MB:
Record<
  CapabilityTier,
  Record<ProcessingClass, number>
> = {
  low: {
    A: 450,
    B: 250,
    C: 180,
    D: 125,
  },

  standard: {
    A: 1000,
    B: 550,
    C: 400,
    D: 275,
  },

  high: {
    A: 2200,
    B: 950,
    C: 750,
    D: 475,
  },

  'very-high': {
    A: 4000,
    B: 1800,
    C: 1300,
    D: 800,
  },
};

/*
 * Maximum fraction of the browser JS heap that a tool's
 * selected source workload should represent.
 *
 * Whole-document tools receive the smallest fraction.
 */
const HEAP_FRACTION:
Record<ProcessingClass, number> = {
  A: 0.45,
  B: 0.22,
  C: 0.16,
  D: 0.12,
};

const MEMORY_MODIFIER:
Record<ResourceIntensity, number> = {
  low: 1.08,
  medium: 1,
  high: 0.95,
  'very-high': 0.88,
};

const READINESS_MODIFIER:
Record<DesktopLargeFileReadiness, number> = {
  ready: 1,
  conservative: 0.92,
  'upgrade-priority': 0.82,
};

const RECOVERY_MODIFIER:
Record<RecoveryMode, number> = {
  none: 0.92,
  workspace: 1,
  'atomic-restart': 0.98,
  'page-checkpoint': 1.05,
  streaming: 1.08,
};

const CONFIDENCE_MODIFIER:
Record<CapabilityConfidence, number> = {
  low: 0.78,
  medium: 0.9,
  high: 1,
};

export interface DesktopWorkloadMetrics {
  /**
   * Combined selected input bytes.
   *
   * For a single-file tool this is simply file.size.
   * For Merge/Compare/image batches this must be the
   * combined size of all selected inputs.
   */
  selectedBytes: number;

  /**
   * Optional total page count.
   *
   * Used only by tools whose profile says page complexity
   * matters.
   */
  pageCount?: number | null;

  /**
   * Optional estimated total decoded/rendered pixels.
   *
   * This is intentionally optional because it may not be
   * cheaply available for every PDF before processing.
   */
  totalPixels?: number | null;

  /**
   * Optional concrete temporary-storage requirement.
   *
   * If supplied and greater than currently available browser
   * storage, assessWorkload() marks the workload RED with
   * blockedByStorage=true.
   */
  estimatedRequiredStorageBytes?: number | null;
}

export interface DesktopCapacityModifiers {
  browser: number;
  confidence: number;
  memoryIntensity: number;
  readiness: number;
  recovery: number;
  opfs: number;
  pageComplexity: number;
  pixelComplexity: number;
}

export interface DesktopCapacityRecommendation {
  toolId: string;
  toolName: string;
  processingClass: ProcessingClass;

  applicable: boolean;

  /**
   * Null on mobile/tablet because this calculator is only
   * advisory for Desktop Pro.
   */
  recommendedBytes: number | null;

  baseRecommendationBytes: number | null;
  heapCapBytes: number | null;
  storageCapBytes: number | null;

  modifiers: DesktopCapacityModifiers | null;

  assessment: WorkloadAssessment | null;

  reason: string;
}

const finitePositiveOrNull = (
  value: unknown
): number | null => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  return value;
};

const browserModifier = (
  snapshot: DeviceCapabilitySnapshot
): number => {
  switch (snapshot.browser.engine) {
    case 'blink':
      return 1;

    case 'gecko':
      return 0.95;

    case 'webkit':
      /*
       * Safari/WebKit is intentionally a little more
       * conservative for very large in-browser workloads.
       */
      return 0.85;

    default:
      return 0.9;
  }
};

const pageComplexityModifier = (
  profile: ToolCapacityProfile,
  pageCount: number | null
): number => {
  if (
    !profile.pageComplexity ||
    pageCount === null
  ) {
    return 1;
  }

  if (pageCount <= 100) {
    return 1;
  }

  if (pageCount <= 250) {
    return 0.95;
  }

  if (pageCount <= 500) {
    return 0.9;
  }

  if (pageCount <= 1000) {
    return 0.8;
  }

  return 0.7;
};

const pixelComplexityModifier = (
  profile: ToolCapacityProfile,
  totalPixels: number | null
): number => {
  if (
    !profile.pixelComplexity ||
    totalPixels === null
  ) {
    return 1;
  }

  /*
   * Total decoded/rendered pixel workload.
   *
   * 250M pixels is already a substantial browser-side
   * rendering workload, but page-at-a-time engines can
   * generally handle it safely.
   */
  if (totalPixels <= 250_000_000) {
    return 1;
  }

  if (totalPixels <= 500_000_000) {
    return 0.93;
  }

  if (totalPixels <= 1_000_000_000) {
    return 0.85;
  }

  if (totalPixels <= 2_000_000_000) {
    return 0.75;
  }

  return 0.65;
};

const storageBaseMultiplier = (
  intensity: ResourceIntensity
): number => {
  switch (intensity) {
    case 'low':
      return 2;

    case 'medium':
      return 3;

    case 'high':
      return 4;

    case 'very-high':
      return 5;
  }
};

const outputStorageAddition = (
  growth: OutputGrowth
): number => {
  switch (growth) {
    case 'small':
      return 0;

    case 'similar':
      return 0.25;

    case 'variable':
      return 0.5;

    case 'large':
      return 1;
  }
};

const storageCapForProfile = (
  profile: ToolCapacityProfile,
  snapshot: DeviceCapabilitySnapshot
): number | null => {
  /*
   * Only use browser-storage headroom as a recommendation
   * cap when the audited tool actually depends on OPFS /
   * durable browser-local storage.
   */
  if (!profile.usesOpfs) {
    return null;
  }

  const available =
    finitePositiveOrNull(
      snapshot.storage.availableBytes
    );

  if (available === null) {
    return null;
  }

  const tempMultiplier =
    storageBaseMultiplier(
      profile.storageIntensity
    ) +
    outputStorageAddition(
      profile.outputGrowth
    );

  return (
    available /
    Math.max(1, tempMultiplier)
  );
};

const opfsModifier = (
  profile: ToolCapacityProfile,
  snapshot: DeviceCapabilitySnapshot
): number => {
  if (!profile.usesOpfs) {
    return 1;
  }

  /*
   * A tool designed around OPFS can still have a fallback,
   * but recommendation should be more conservative when
   * durable local storage is unavailable.
   */
  return snapshot.storage.opfsSupported
    ? 1
    : 0.72;
};

const roundRecommendation = (
  bytes: number
): number => {
  const safe =
    Math.max(
      1,
      bytes
    );

  /*
   * Present recommendations in stable 25 MB steps rather
   * than implying byte-level precision.
   */
  const step =
    25 * MB;

  if (safe < step) {
    return Math.floor(safe);
  }

  return (
    Math.floor(
      safe / step
    ) * step
  );
};

const resolveProfile = (
  profileOrId:
    | ToolCapacityProfile
    | string
): ToolCapacityProfile | null => {
  if (
    typeof profileOrId ===
    'string'
  ) {
    return getToolCapacityProfile(
      profileOrId
    );
  }

  return profileOrId;
};

/**
 * Calculate an advisory Desktop capacity recommendation.
 *
 * No enforcement happens here.
 */
export function calculateDesktopCapacity(
  snapshot: DeviceCapabilitySnapshot,
  profileOrId:
    | ToolCapacityProfile
    | string,
  workload?: DesktopWorkloadMetrics
): DesktopCapacityRecommendation | null {
  const profile =
    resolveProfile(
      profileOrId
    );

  if (!profile) {
    return null;
  }

  /*
   * Keep mobile/tablet completely outside this calculator.
   * Existing mobile safety enforcement remains elsewhere.
   */
  if (
    snapshot.device
      .isMobileSafetyEnvironment
  ) {
    return {
      toolId: profile.id,
      toolName: profile.name,
      processingClass:
        profile.processingClass,

      applicable: false,

      recommendedBytes: null,
      baseRecommendationBytes:
        null,
      heapCapBytes: null,
      storageCapBytes: null,

      modifiers: null,
      assessment: null,

      reason:
        'Desktop capacity recommendation is not applied to the mobile/tablet safety environment.',
    };
  }

  const baseRecommendationBytes =
    BASE_RECOMMENDATION_MB[
      snapshot.capability.tier
    ][profile.processingClass] *
    MB;

  const pageCount =
    finitePositiveOrNull(
      workload?.pageCount
    );

  const totalPixels =
    finitePositiveOrNull(
      workload?.totalPixels
    );

  const modifiers:
    DesktopCapacityModifiers = {
    browser:
      browserModifier(snapshot),

    confidence:
      CONFIDENCE_MODIFIER[
        snapshot.capability
          .confidence
      ],

    memoryIntensity:
      MEMORY_MODIFIER[
        profile.memoryIntensity
      ],

    readiness:
      READINESS_MODIFIER[
        profile.desktopReadiness
      ],

    recovery:
      RECOVERY_MODIFIER[
        profile.recovery
      ],

    opfs:
      opfsModifier(
        profile,
        snapshot
      ),

    pageComplexity:
      pageComplexityModifier(
        profile,
        pageCount
      ),

    pixelComplexity:
      pixelComplexityModifier(
        profile,
        totalPixels
      ),
  };

  const rawRecommendation =
    baseRecommendationBytes *
    modifiers.browser *
    modifiers.confidence *
    modifiers.memoryIntensity *
    modifiers.readiness *
    modifiers.recovery *
    modifiers.opfs *
    modifiers.pageComplexity *
    modifiers.pixelComplexity;

  const jsHeapLimit =
    finitePositiveOrNull(
      snapshot.memory
        .jsHeapLimitBytes
    );

  const heapCapBytes =
    jsHeapLimit === null
      ? null
      : (
        jsHeapLimit *
        HEAP_FRACTION[
          profile.processingClass
        ]
      );

  const storageCapBytes =
    storageCapForProfile(
      profile,
      snapshot
    );

  const candidates: number[] = [
    rawRecommendation,
  ];

  if (heapCapBytes !== null) {
    candidates.push(
      heapCapBytes
    );
  }

  if (storageCapBytes !== null) {
    candidates.push(
      storageCapBytes
    );
  }

  const recommendedBytes =
    roundRecommendation(
      Math.min(
        ...candidates
      )
    );

  const selectedBytes =
    Math.max(
      0,
      workload?.selectedBytes ??
        0
    );

  const assessment =
    workload
      ? assessWorkload(
        selectedBytes,
        recommendedBytes,
        {
          estimatedRequiredStorageBytes:
            workload
              .estimatedRequiredStorageBytes ??
            null,

          availableStorageBytes:
            snapshot.storage
              .availableBytes,
        }
      )
      : null;

  return {
    toolId: profile.id,
    toolName: profile.name,
    processingClass:
      profile.processingClass,

    applicable: true,

    recommendedBytes,
    baseRecommendationBytes,
    heapCapBytes,
    storageCapBytes,

    modifiers,
    assessment,

    reason:
      'Advisory Desktop recommendation calculated from device, browser, tool architecture and available workload signals.',
  };
}

/**
 * Convenience helper when only the recommended byte value
 * is needed.
 *
 * Returns null for unknown tools or mobile/tablet.
 */
export function getDesktopRecommendedBytes(
  snapshot: DeviceCapabilitySnapshot,
  toolIdOrRoute: string,
  workload?: DesktopWorkloadMetrics
): number | null {
  return (
    calculateDesktopCapacity(
      snapshot,
      toolIdOrRoute,
      workload
    )?.recommendedBytes ??
    null
  );
}
