export const HARD_TASK_LIMIT_MB = 150;
export const HARD_TASK_LIMIT_BYTES =
  HARD_TASK_LIMIT_MB * 1024 * 1024;

export interface FileSizeCheck {
  allowed: boolean;
  totalBytes: number;
  totalMB: number;
  errorMessage: string | null;
}

export function validateTaskFiles(
  files: Iterable<File>,
  label = "Selected files"
): FileSizeCheck {
  const list = Array.from(files);

  const totalBytes = list.reduce(
    (total, file) => total + file.size,
    0
  );

  const totalMB =
    totalBytes / 1024 / 1024;

  if (totalBytes <= HARD_TASK_LIMIT_BYTES) {
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
