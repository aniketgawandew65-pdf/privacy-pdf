import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  HardDrive,
} from 'lucide-react';

import {
  formatCapabilityBytes,
  type WorkloadSignal,
} from '../utils/deviceCapability';

import type {
  DesktopCapacityRecommendation,
} from '../utils/desktopCapacityCalculator';

interface DesktopCapacityStatusProps {
  recommendation:
    | DesktopCapacityRecommendation
    | null;

  className?: string;
}

const SIGNAL_LABEL:
Record<WorkloadSignal, string> = {
  green: 'Within range',
  amber: 'Above estimated range',
  red: 'High workload',
};

const SIGNAL_COPY:
Record<WorkloadSignal, string> = {
  green:
    'This workload is comfortably within the estimated range for this device and browser.',

  amber:
    'This workload is above the estimated range. You can still try it, but processing may take longer or use more memory.',

  red:
    'This workload is significantly above the estimated range. Processing may fail or restart on this device.',
};

const SIGNAL_STYLE:
Record<
  WorkloadSignal,
  {
    container: string;
    badge: string;
    bar: string;
  }
> = {
  green: {
    container:
      'border-emerald-500/35 bg-emerald-500/5',
    badge:
      'border-emerald-500/35 bg-emerald-500/10 text-emerald-400',
    bar:
      'bg-emerald-500',
  },

  amber: {
    container:
      'border-amber-500/40 bg-amber-500/5',
    badge:
      'border-amber-500/40 bg-amber-500/10 text-amber-400',
    bar:
      'bg-amber-500',
  },

  red: {
    container:
      'border-red-500/40 bg-red-500/5',
    badge:
      'border-red-500/40 bg-red-500/10 text-red-400',
    bar:
      'bg-red-500',
  },
};

const signalIcon = (
  signal: WorkloadSignal
) => {
  if (signal === 'green') {
    return (
      <CheckCircle2
        size={17}
        aria-hidden="true"
      />
    );
  }

  return (
    <AlertTriangle
      size={17}
      aria-hidden="true"
    />
  );
};

export function DesktopCapacityStatus({
  recommendation,
  className = '',
}: DesktopCapacityStatusProps) {
  /*
   * This component is deliberately presentation-only.
   *
   * Mobile/tablet returns null because the Desktop
   * recommendation calculator marks those environments
   * as not applicable.
   */
  if (
    !recommendation ||
    !recommendation.applicable ||
    recommendation.recommendedBytes ===
      null
  ) {
    return null;
  }

  const assessment =
    recommendation.assessment;

  const recommendedBytes =
    recommendation.recommendedBytes;

  const signal =
    assessment?.signal ??
    'green';

  const selectedBytes =
    assessment?.selectedBytes ??
    0;

  const ratio =
    assessment?.ratio ??
    0;

  const blockedByStorage =
    Boolean(
      assessment
        ?.blockedByStorage
    );

  const styles =
    SIGNAL_STYLE[signal];

  /*
   * Cap the visual bar at 100%.
   * The numerical ratio remains untouched.
   */
  const progressPercent =
    Math.max(
      0,
      Math.min(
        100,
        ratio * 100
      )
    );

  const selectedLabel =
    selectedBytes > 0
      ? formatCapabilityBytes(
        selectedBytes
      )
      : 'Not selected';

  const statusCopy =
    blockedByStorage
      ? 'This workload needs more browser-local storage than is currently available. Free some space or use a smaller workload.'
      : SIGNAL_COPY[signal];

  return (
    <section
      className={[
        'w-full rounded-xl border p-4',
        styles.container,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Desktop processing capacity"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white"
            aria-hidden="true"
          >
            <Gauge size={18} />
          </div>

          <div className="min-w-0">
            <p className="m-0 text-xs font-semibold text-[#202023]">
              Desktop capacity
            </p>

            <p className="mt-1 text-xs leading-5 text-[#55555d]">
              Estimated capacity on this device for{' '}
              {recommendation.toolName}:{' '}
              <strong className="font-semibold text-[#202023]">
                ~
                {formatCapabilityBytes(
                  recommendedBytes
                )}
              </strong>
            </p>
          </div>
        </div>

        {assessment && (
          <span
            className={[
              'inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
              styles.badge,
            ].join(' ')}
          >
            {signalIcon(signal)}

            {blockedByStorage
              ? 'Storage limited'
              : SIGNAL_LABEL[
                signal
              ]}
          </span>
        )}
      </div>

      {assessment && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-[#55555d]">
                Selected
              </span>

              <strong className="mt-1 block text-sm font-semibold text-[#202023]">
                {selectedLabel}
              </strong>
            </div>

            <div className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-[#55555d]">
                Estimated capacity
              </span>

              <strong className="mt-1 block text-sm font-semibold text-[#202023]">
                ~
                {formatCapabilityBytes(
                  recommendedBytes
                )}
              </strong>
            </div>
          </div>

          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-200"
            aria-hidden="true"
          >
            <div
              className={[
                'h-full rounded-full transition-[width] duration-300',
                styles.bar,
              ].join(' ')}
              style={{
                width:
                  `${progressPercent}%`,
              }}
            />
          </div>

          <p
            className="mt-3 mb-0 flex items-start gap-2 text-xs leading-5 text-[#34343a]"
            role={
              signal === 'red'
                ? 'alert'
                : 'status'
            }
          >
            {blockedByStorage ? (
              <HardDrive
                size={15}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
            ) : (
              signalIcon(signal)
            )}

            <span>
              {statusCopy}
            </span>
          </p>
        </>
      )}

      <p className="mt-3 mb-0 text-[10px] leading-4 text-[#55555d]">
        Capacity is estimated from your device,
        browser and this tool&apos;s processing
        architecture. It is guidance, not a required
        file size or guaranteed maximum.
      </p>
    </section>
  );
}
