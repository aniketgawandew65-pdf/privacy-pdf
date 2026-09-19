/**
 * 1into1 PDF — Device Capability Engine
 *
 * PHASE 1 ONLY:
 * - Observes browser/device capability.
 * - Does NOT change file-size limits.
 * - Does NOT change mobile behaviour.
 * - Does NOT change task credits.
 * - Does NOT touch any PDF tool engine.
 *
 * Later phases will use this information to calculate
 * tool-specific Desktop Pro processing recommendations.
 */

export type DeviceKind =
  | 'desktop'
  | 'mobile'
  | 'tablet';

export type OperatingSystem =
  | 'windows'
  | 'macos'
  | 'linux'
  | 'ios'
  | 'ipados'
  | 'android'
  | 'unknown';

export type BrowserEngine =
  | 'blink'
  | 'webkit'
  | 'gecko'
  | 'unknown';

export type BrowserName =
  | 'chrome'
  | 'edge'
  | 'safari'
  | 'firefox'
  | 'other';

export type CapabilityTier =
  | 'low'
  | 'standard'
  | 'high'
  | 'very-high';

export type CapabilityConfidence =
  | 'low'
  | 'medium'
  | 'high';

export type WorkloadSignal =
  | 'green'
  | 'amber'
  | 'red';

interface NavigatorUADataLike {
  mobile?: boolean;
  platform?: string;
}

interface NavigatorCapabilityLike
  extends Navigator {
  deviceMemory?: number;
  userAgentData?: NavigatorUADataLike;
}

interface PerformanceMemoryLike {
  jsHeapSizeLimit?: number;
  totalJSHeapSize?: number;
  usedJSHeapSize?: number;
}

interface PerformanceCapabilityLike
  extends Performance {
  memory?: PerformanceMemoryLike;
}

export interface DeviceCapabilitySnapshot {
  capturedAt: string;

  device: {
    kind: DeviceKind;
    isDesktop: boolean;
    isMobileSafetyEnvironment: boolean;
    os: OperatingSystem;
  };

  browser: {
    name: BrowserName;
    engine: BrowserEngine;
    userAgent: string;
  };

  hardware: {
    deviceMemoryGB: number | null;
    logicalProcessors: number | null;
  };

  memory: {
    jsHeapLimitBytes: number | null;
    jsHeapUsedBytes: number | null;
    jsHeapTotalBytes: number | null;
  };

  storage: {
    quotaBytes: number | null;
    usageBytes: number | null;
    availableBytes: number | null;
    opfsSupported: boolean;
    persistentStorageGranted: boolean | null;
  };

  capability: {
    tier: CapabilityTier;
    confidence: CapabilityConfidence;
    observedSignalCount: number;
  };
}

export interface WorkloadAssessment {
  signal: WorkloadSignal;
  selectedBytes: number;
  recommendedBytes: number;
  ratio: number;
  blockedByStorage: boolean;
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

const detectOS = (
  nav: NavigatorCapabilityLike
): OperatingSystem => {
  const ua =
    nav.userAgent || '';

  const platform =
    nav.platform || '';

  const hintedPlatform =
    nav.userAgentData
      ?.platform
      ?.toLowerCase() || '';

  const maxTouchPoints =
    nav.maxTouchPoints || 0;

  /*
   * iPadOS can intentionally identify itself as macOS.
   * MacIntel + multiple touch points is the important
   * Safari/iPadOS fallback.
   */
  const looksLikeIPad =
    /iPad/i.test(ua) ||
    (
      platform === 'MacIntel' &&
      maxTouchPoints > 1
    );

  if (looksLikeIPad) {
    return 'ipados';
  }

  if (
    /iPhone|iPod/i.test(ua)
  ) {
    return 'ios';
  }

  if (/Android/i.test(ua)) {
    return 'android';
  }

  if (
    hintedPlatform.includes(
      'windows'
    ) ||
    /Win/i.test(platform)
  ) {
    return 'windows';
  }

  if (
    hintedPlatform.includes(
      'mac'
    ) ||
    /Mac/i.test(platform)
  ) {
    return 'macos';
  }

  if (
    hintedPlatform.includes(
      'linux'
    ) ||
    /Linux/i.test(platform)
  ) {
    return 'linux';
  }

  return 'unknown';
};

const detectDeviceKind = (
  nav: NavigatorCapabilityLike,
  os: OperatingSystem
): DeviceKind => {
  if (
    os === 'ipados'
  ) {
    return 'tablet';
  }

  if (
    os === 'ios'
  ) {
    return 'mobile';
  }

  if (
    os === 'android'
  ) {
    return /Mobile/i.test(
      nav.userAgent
    )
      ? 'mobile'
      : 'tablet';
  }

  /*
   * Client Hints "mobile" is useful where available,
   * but never use screen width as a desktop/mobile rule.
   */
  if (
    nav.userAgentData
      ?.mobile === true
  ) {
    return 'mobile';
  }

  return 'desktop';
};

/**
 * Synchronous runtime safety classification.
 *
 * Reuses the exact same OS/device detection as the full
 * capability snapshot, without waiting for storage/heap probes.
 *
 * Conservative fallback: anything that cannot be positively
 * classified as Desktop remains in the mobile safety policy.
 */
export function isMobileSafetyEnvironment(): boolean {
  if (
    typeof navigator ===
      'undefined'
  ) {
    return true;
  }

  const nav =
    navigator as
      NavigatorCapabilityLike;

  const os =
    detectOS(nav);

  const kind =
    detectDeviceKind(
      nav,
      os
    );

  return kind !== 'desktop';
}

const detectBrowser = (
  nav: NavigatorCapabilityLike,
  os: OperatingSystem
): {
  name: BrowserName;
  engine: BrowserEngine;
} => {
  const ua =
    nav.userAgent || '';

  const isAppleMobile =
    os === 'ios' ||
    os === 'ipados';

  /*
   * Every browser on iOS/iPadOS currently runs through
   * Apple's WebKit browser engine.
   */
  if (isAppleMobile) {
    if (/FxiOS/i.test(ua)) {
      return {
        name: 'firefox',
        engine: 'webkit',
      };
    }

    if (
      /CriOS|Chrome/i.test(
        ua
      )
    ) {
      return {
        name: 'chrome',
        engine: 'webkit',
      };
    }

    if (/EdgiOS/i.test(ua)) {
      return {
        name: 'edge',
        engine: 'webkit',
      };
    }

    return {
      name: 'safari',
      engine: 'webkit',
    };
  }

  if (/Edg\//i.test(ua)) {
    return {
      name: 'edge',
      engine: 'blink',
    };
  }

  if (
    /Chrome|Chromium|CriOS/i.test(
      ua
    ) &&
    !/Edg\//i.test(ua)
  ) {
    return {
      name: 'chrome',
      engine: 'blink',
    };
  }

  if (/Firefox\//i.test(ua)) {
    return {
      name: 'firefox',
      engine: 'gecko',
    };
  }

  if (
    /Safari\//i.test(ua) &&
    /AppleWebKit/i.test(ua)
  ) {
    return {
      name: 'safari',
      engine: 'webkit',
    };
  }

  if (/AppleWebKit/i.test(ua)) {
    return {
      name: 'other',
      engine: 'webkit',
    };
  }

  return {
    name: 'other',
    engine: 'unknown',
  };
};

const scoreDeviceMemory = (
  gb: number
): number => {
  if (gb <= 4) {
    return 0;
  }

  if (gb <= 8) {
    return 1;
  }

  if (gb <= 16) {
    return 2;
  }

  return 3;
};

const scoreHeap = (
  bytes: number
): number => {
  const gb =
    bytes /
    (1024 ** 3);

  if (gb < 1.5) {
    return 0;
  }

  if (gb < 3) {
    return 1;
  }

  if (gb < 6) {
    return 2;
  }

  return 3;
};

const scoreStorage = (
  bytes: number
): number => {
  const gb =
    bytes /
    (1024 ** 3);

  if (gb < 1) {
    return 0;
  }

  if (gb < 4) {
    return 1;
  }

  if (gb < 16) {
    return 2;
  }

  return 3;
};

const calculateCapability = (
  input: {
    deviceMemoryGB:
      number | null;
    logicalProcessors:
      number | null;
    jsHeapLimitBytes:
      number | null;
    availableStorageBytes:
      number | null;
  }
): {
  tier: CapabilityTier;
  confidence:
    CapabilityConfidence;
  observedSignalCount:
    number;
} => {
  let weightedScore = 0;
  let totalWeight = 0;
  let observedSignalCount =
    0;

  const addSignal = (
    score: number,
    weight: number
  ) => {
    weightedScore +=
      score * weight;

    totalWeight +=
      weight;

    observedSignalCount +=
      1;
  };

  /*
   * RAM and browser heap are stronger indicators for
   * large local PDF jobs, so they receive extra weight.
   */
  if (
    input.deviceMemoryGB !==
    null
  ) {
    addSignal(
      scoreDeviceMemory(
        input.deviceMemoryGB
      ),
      2
    );
  }

  if (
    input.jsHeapLimitBytes !==
    null
  ) {
    addSignal(
      scoreHeap(
        input.jsHeapLimitBytes
      ),
      2
    );
  }

  /*
   * CPU concurrency affects processing speed and future
   * worker-count decisions, but it should not reduce the
   * safe file-size tier. A low-core desktop with sufficient
   * RAM/heap/storage may process more slowly without having
   * a lower memory capacity.
   *
   * Keep logicalProcessors in the snapshot for later phases.
   */

  if (
    input.availableStorageBytes !==
    null
  ) {
    addSignal(
      scoreStorage(
        input.availableStorageBytes
      ),
      1
    );
  }

  if (totalWeight === 0) {
    return {
      tier: 'standard',
      confidence: 'low',
      observedSignalCount:
        0,
    };
  }

  const average =
    weightedScore /
    totalWeight;

  let tier:
    CapabilityTier;

  if (average < 0.75) {
    tier = 'low';
  } else if (
    average < 1.5
  ) {
    tier = 'standard';
  } else if (
    average < 2.25
  ) {
    tier = 'high';
  } else {
    tier = 'very-high';
  }

  const strongSignals =
    Number(
      input.deviceMemoryGB !==
        null
    ) +
    Number(
      input.jsHeapLimitBytes !==
        null
    ) +
    Number(
      input.availableStorageBytes !==
        null
    );

  let confidence:
    CapabilityConfidence;

  if (
    strongSignals >= 3
  ) {
    confidence = 'high';
  } else if (
    observedSignalCount >= 2
  ) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    tier,
    confidence,
    observedSignalCount,
  };
};

/**
 * Read the current runtime every time this function is called.
 *
 * Nothing is permanently assigned to a user/device.
 * If the browser, RAM exposure, storage quota, etc. change
 * later, a future call receives the new capability snapshot.
 */
export async function
getDeviceCapabilitySnapshot():
Promise<DeviceCapabilitySnapshot> {
  const nav =
    navigator as
      NavigatorCapabilityLike;

  const perf =
    performance as
      PerformanceCapabilityLike;

  const os =
    detectOS(nav);

  const kind =
    detectDeviceKind(
      nav,
      os
    );

  const browser =
    detectBrowser(
      nav,
      os
    );

  const deviceMemoryGB =
    finitePositiveOrNull(
      nav.deviceMemory
    );

  const logicalProcessors =
    finitePositiveOrNull(
      nav.hardwareConcurrency
    );

  const jsHeapLimitBytes =
    finitePositiveOrNull(
      perf.memory
        ?.jsHeapSizeLimit
    );

  const jsHeapUsedBytes =
    finitePositiveOrNull(
      perf.memory
        ?.usedJSHeapSize
    );

  const jsHeapTotalBytes =
    finitePositiveOrNull(
      perf.memory
        ?.totalJSHeapSize
    );

  let quotaBytes:
    number | null =
      null;

  let usageBytes:
    number | null =
      null;

  let availableBytes:
    number | null =
      null;

  let persistentStorageGranted:
    boolean | null =
      null;

  const storage =
    navigator.storage;

  if (storage) {
    try {
      const estimate =
        await storage.estimate();

      quotaBytes =
        finitePositiveOrNull(
          estimate.quota
        );

      usageBytes =
        typeof estimate.usage ===
          'number' &&
        Number.isFinite(
          estimate.usage
        ) &&
        estimate.usage >= 0
          ? estimate.usage
          : null;

      if (
        quotaBytes !== null &&
        usageBytes !== null
      ) {
        availableBytes =
          Math.max(
            0,
            quotaBytes -
              usageBytes
          );
      }
    } catch {
      /*
       * Storage estimation is best-effort.
       * Unsupported/restricted browsers remain usable.
       */
    }

    try {
      if (
        typeof storage.persisted ===
        'function'
      ) {
        persistentStorageGranted =
          await storage.persisted();
      }
    } catch {
      persistentStorageGranted =
        null;
    }
  }

  /*
   * Feature detection only.
   * Do NOT open or mutate OPFS in Phase 1.
   */
  const opfsSupported =
    Boolean(
      storage &&
      typeof storage
        .getDirectory ===
        'function'
    );

  const capability =
    calculateCapability({
      deviceMemoryGB,
      logicalProcessors,
      jsHeapLimitBytes,
      availableStorageBytes:
        availableBytes,
    });

  return {
    capturedAt:
      new Date()
        .toISOString(),

    device: {
      kind,
      isDesktop:
        kind === 'desktop',

      /*
       * Current product policy:
       * mobile phones + tablets retain mobile safety rules.
       */
      isMobileSafetyEnvironment:
        kind !== 'desktop',

      os,
    },

    browser: {
      name:
        browser.name,
      engine:
        browser.engine,
      userAgent:
        nav.userAgent || '',
    },

    hardware: {
      deviceMemoryGB,
      logicalProcessors,
    },

    memory: {
      jsHeapLimitBytes,
      jsHeapUsedBytes,
      jsHeapTotalBytes,
    },

    storage: {
      quotaBytes,
      usageBytes,
      availableBytes,
      opfsSupported,
      persistentStorageGranted,
    },

    capability,
  };
}

/**
 * Generic Phase-1 traffic-light primitive.
 *
 * Tool-specific recommendedBytes will be supplied later.
 * This function currently does NOT block uploads or tasks.
 */
export function assessWorkload(
  selectedBytes: number,
  recommendedBytes: number,
  options?: {
    estimatedRequiredStorageBytes?:
      number | null;
    availableStorageBytes?:
      number | null;
  }
): WorkloadAssessment {
  const selected =
    Math.max(
      0,
      selectedBytes
    );

  const recommended =
    Math.max(
      1,
      recommendedBytes
    );

  const ratio =
    selected /
    recommended;

  const estimatedRequiredStorageBytes =
    options
      ?.estimatedRequiredStorageBytes ??
    null;

  const availableStorageBytes =
    options
      ?.availableStorageBytes ??
    null;

  const blockedByStorage =
    estimatedRequiredStorageBytes !==
      null &&
    availableStorageBytes !==
      null &&
    estimatedRequiredStorageBytes >
      availableStorageBytes;

  let signal:
    WorkloadSignal;

  if (
    blockedByStorage ||
    ratio > 1.5
  ) {
    signal = 'red';
  } else if (
    ratio > 1
  ) {
    signal = 'amber';
  } else {
    signal = 'green';
  }

  return {
    signal,
    selectedBytes:
      selected,
    recommendedBytes:
      recommended,
    ratio,
    blockedByStorage,
  };
}

export function formatCapabilityBytes(
  bytes: number | null
): string {
  if (
    bytes === null ||
    !Number.isFinite(bytes)
  ) {
    return 'Unavailable';
  }

  const gb =
    bytes /
    (1024 ** 3);

  if (gb >= 1) {
    return `${gb.toFixed(
      gb >= 10
        ? 1
        : 2
    )} GB`;
  }

  const mb =
    bytes /
    (1024 ** 2);

  return `${mb.toFixed(
    mb >= 10
      ? 0
      : 1
  )} MB`;
}
