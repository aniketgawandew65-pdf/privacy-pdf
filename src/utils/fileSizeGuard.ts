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
  const adaptiveDesktopPro =
    options.isPro === true &&
    options.isMobileSafetyEnvironment === false;

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
