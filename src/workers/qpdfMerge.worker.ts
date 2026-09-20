import createQpdf from '@neslinesli93/qpdf-wasm';

interface MergeRequest {
  type: 'merge';
  files: File[];
}

interface ProgressMessage {
  type: 'progress';
  stage: string;
}

interface DoneMessage {
  type: 'done';
  blob: Blob;
  size: number;
}

interface ErrorMessage {
  type: 'error';
  message: string;
}

type WorkerResponse =
  | ProgressMessage
  | DoneMessage
  | ErrorMessage;

const send = (
  message: WorkerResponse
) => {
  self.postMessage(message);
};

const errorText = (
  error: unknown
): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

self.onmessage = async (
  event: MessageEvent<MergeRequest>
) => {
  const message = event.data;

  if (
    !message ||
    message.type !== 'merge'
  ) {
    return;
  }

  const files =
    message.files || [];

  if (files.length < 2) {
    send({
      type: 'error',
      message:
        'Choose at least two PDF files to merge.',
    });

    return;
  }

  const mountPoint =
    '/merge-inputs';

  const outputPath =
    '/merged-output.pdf';

  let qpdf: any = null;
  let mounted = false;

  const stderr: string[] =
    [];

  try {
    send({
      type: 'progress',
      stage:
        'Loading optimized merge engine…',
    });

    const factory =
      createQpdf as unknown as (
        options: Record<
          string,
          unknown
        >
      ) => Promise<any>;

    qpdf =
      await factory({
        locateFile: () =>
          '/wasm/qpdf.wasm',

        print: () => {},

        printErr: (
          line: unknown
        ) => {
          const text =
            String(line);

          stderr.push(text);

          if (
            stderr.length > 20
          ) {
            stderr.shift();
          }
        },
      });

    send({
      type: 'progress',
      stage:
        'Mounting source files without duplicating them in JavaScript memory…',
    });

    qpdf.FS.mkdir(
      mountPoint
    );

    qpdf.FS.mount(
      qpdf.WORKERFS,
      {
        blobs:
          files.map(
            (
              file,
              index
            ) => ({
              name:
                `source-${index}.pdf`,
              data:
                file,
            })
          ),
      },
      mountPoint
    );

    mounted = true;

    const args: string[] = [
      '--empty',
      '--pages',
    ];

    files.forEach(
      (
        _file,
        index
      ) => {
        args.push(
          `${mountPoint}/source-${index}.pdf`,
          '1-z'
        );
      }
    );

    args.push(
      '--',
      outputPath
    );

    send({
      type: 'progress',
      stage:
        `Merging ${files.length} PDFs locally…`,
    });

    let exitStatus = 0;

    try {
      const result =
        qpdf.callMain(
          args
        );

      if (
        typeof result ===
        'number'
      ) {
        exitStatus =
          result;
      }
    } catch (
      error: any
    ) {
      if (
        typeof error?.status ===
        'number'
      ) {
        exitStatus =
          error.status;
      } else {
        throw error;
      }
    }

    /*
     * qpdf:
     * 0 = success
     * 3 = completed with warnings
     */
    if (
      exitStatus !== 0 &&
      exitStatus !== 3
    ) {
      const detail =
        stderr
          .slice(-4)
          .join(' ')
          .trim();

      throw new Error(
        detail ||
          `qpdf exited with status ${exitStatus}.`
      );
    }

    send({
      type: 'progress',
      stage:
        'Finalizing merged PDF…',
    });

    const outputBytes =
      qpdf.FS.readFile(
        outputPath
      ) as Uint8Array;

    const blob =
      new Blob(
        [
          outputBytes as unknown as
            BlobPart,
        ],
        {
          type:
            'application/pdf',
        }
      );

    /*
     * Release the WASM/MEMFS output as soon as
     * the browser-backed Blob exists.
     */
    try {
      qpdf.FS.unlink?.(
        outputPath
      );
    } catch {
      // Best effort cleanup.
    }

    send({
      type: 'done',
      blob,
      size:
        blob.size,
    });
  } catch (error) {
    const detail =
      stderr
        .slice(-4)
        .join(' ')
        .trim();

    send({
      type: 'error',
      message:
        detail ||
        errorText(error),
    });
  } finally {
    if (
      qpdf &&
      mounted
    ) {
      try {
        qpdf.FS.unmount(
          mountPoint
        );
      } catch {
        // Worker termination releases remaining memory.
      }
    }
  }
};
