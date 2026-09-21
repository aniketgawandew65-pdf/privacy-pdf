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
   * Desktop now uses the same device-sized local-processing policy
   * for Free, Google bonus, and Pro tasks.
   *
   * This does NOT mean infinite processing capacity. The browser,
   * hardware, and tool-specific resource checks still determine
   * practical limits.
   *
   * Mobile/tablet keeps the shared 150 MB safety ceiling.
   */
  const effectiveMobileSafetyEnvironment =
    options.isMobileSafetyEnvironment ??
    isMobileSafetyEnvironment();

  const adaptiveDesktop =
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
    adaptiveDesktop ||
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
