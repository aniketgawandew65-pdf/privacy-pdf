import { getLicenseStatus } from './license';
import { isMobileSafetyEnvironment } from './deviceCapability';
import { checkActionAllowed } from './usageTracker';

export const HARD_TASK_LIMIT_MB = 150;
export const HARD_TASK_LIMIT_BYTES =
  HARD_TASK_LIMIT_MB * 1024 * 1024;

export interface FileSizeCheck {
  allowed: boolean;
  totalBytes: number;
  totalMB: number;
  errorMessage: string | null;
}

export interface FileSizeValidationOptions {
  isPro?: boolean;
  isMobileSafetyEnvironment?: boolean;
}

export function validateTaskFiles(
  files: Iterable<File>,
  label = "Selected files",
  options: FileSizeValidationOptions = {}
): FileSizeCheck {
  const list = Array.from(files);

  const totalBytes = list.reduce(
    (total, file) => total + file.size,
    0
  );

  const totalMB =
    totalBytes / 1024 / 1024;

  /*
   * Desktop Pro no longer uses the shared fixed 150 MB
   * selection gate.
   *
   * This does NOT mean unlimited processing capacity.
   * Desktop Pro will use the separate hardware/tool-aware
   * recommendation system.
   *
   * Mobile and tablet Pro remain hard-limited to 150 MB.
   * Free/Google tiers retain the existing shared gate.
   */
  /*
   * Callers may explicitly provide policy context, as App.tsx does.
   *
   * Older/tool-level callers can omit it and inherit the current
   * runtime entitlement + device classification automatically.
   */
  const effectiveIsPro =
    options.isPro ??
    getLicenseStatus().isPro;

  const effectiveMobileSafetyEnvironment =
    options.isMobileSafetyEnvironment ??
    isMobileSafetyEnvironment();

  const adaptiveDesktopPro =
    effectiveIsPro === true &&
    effectiveMobileSafetyEnvironment === false;

  /*
   * Reject tier-specific oversized inputs immediately at file
   * selection time.
   *
   * checkActionAllowed() is read-only. It does not consume or
   * reserve a task. We intentionally react only to FILE_SIZE_LIMIT
   * here so users who have merely exhausted today's task count can
   * still select a valid-size file and see the normal task-limit
   * message when they actually try to run the tool.
   */
  const entitlementCheck =
    checkActionAllowed(
      totalBytes
    );

  if (
    !entitlementCheck.allowed &&
    entitlementCheck.reason ===
      'FILE_SIZE_LIMIT'
  ) {
    return {
      allowed: false,
      totalBytes,
      totalMB,
      errorMessage:
        entitlementCheck.errorMessage ||
        `${label} exceeds the file-size limit for your current plan.`,
    };
  }

  if (
    adaptiveDesktopPro ||
    totalBytes <= HARD_TASK_LIMIT_BYTES
  ) {
    return {
      allowed: true,
      totalBytes,
      totalMB,
      errorMessage: null,
    };
  }

  return {
    allowed: false,
    totalBytes,
    totalMB,
    errorMessage:
      `${label} total ${totalMB.toFixed(2)} MB. ` +
      `This tool supports up to ${HARD_TASK_LIMIT_MB} MB per task. ` +
      `Remove some files and try again.`,
  };
}
