import {
  checkActionAllowed,
  recordActionExecution,
  type TaskCreditTier,
} from './usageTracker';

export interface TaskCreditResult {
  allowed: boolean;
  reason?: 'DAILY_LIMIT' | 'FILE_SIZE_LIMIT';
  errorMessage?: string;
  creditTier?: TaskCreditTier;
}

/*
 * The application performs one active local task at a time.
 * Batch processing is also serial by default.
 *
 * Keep the tier selected by the immediately preceding
 * entitlement check so a successful task charges exactly
 * that tier.
 */
let pendingCreditTier:
  | TaskCreditTier
  | undefined;

/**
 * Check entitlement immediately before a real tool operation starts.
 *
 * Pass the TOTAL input size for that individual task.
 * Do not call this when merely selecting/uploading a file.
 */
export function checkTaskCredit(
  input:
    | number
    | File
    | Blob
    | Array<File | Blob>
    | null
    | undefined
): TaskCreditResult {
  let totalBytes:
    | number
    | undefined;

  if (typeof input === 'number') {
    totalBytes =
      Math.max(0, input);
  } else if (Array.isArray(input)) {
    totalBytes =
      input.reduce(
        (sum, item) =>
          sum + item.size,
        0
      );
  } else if (input) {
    totalBytes =
      input.size;
  }

  const result =
    checkActionAllowed(
      totalBytes
    );

  pendingCreditTier =
    result.allowed
      ? result.creditTier
      : undefined;

  return result;
}

/**
 * Consume exactly one task credit.
 *
 * Call ONLY after the requested tool operation has completed
 * successfully enough to produce its intended result.
 */
export function commitTaskCredit(): void {
  const creditTier =
    pendingCreditTier;

  pendingCreditTier =
    undefined;

  recordActionExecution(
    creditTier
  );
}

/**
 * Convenience wrapper for straightforward async tools.
 *
 * More complex tools with progress/cancellation can use
 * checkTaskCredit() + commitTaskCredit() separately.
 */
export async function runWithTaskCredit<T>(
  input:
    | number
    | File
    | Blob
    | Array<File | Blob>
    | null
    | undefined,
  operation: () => Promise<T>
): Promise<
  | {
      ok: true;
      result: T;
    }
  | {
      ok: false;
      blocked: true;
      reason?: 'DAILY_LIMIT' | 'FILE_SIZE_LIMIT';
      errorMessage: string;
    }
> {
  const check =
    checkTaskCredit(input);

  if (!check.allowed) {
    return {
      ok: false,
      blocked: true,
      reason:
        check.reason,
      errorMessage:
        check.errorMessage ||
        'This task is not available on your current plan.',
    };
  }

  const result =
    await operation();

  commitTaskCredit();

  return {
    ok: true,
    result,
  };
}
