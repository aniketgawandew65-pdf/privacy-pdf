import React, {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Type,
  Square,
  List,
  Circle,
  Calendar,
  PenLine,
  Download,
  Loader2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  X,
  FileText,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  createFillablePDF,
  type FillableFieldSpec,
  type FillableFieldType,
} from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface CreateFillablePdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

interface EditorField extends FillableFieldSpec {}

type ResizeCorner =
  | 'nw'
  | 'ne'
  | 'se'
  | 'sw';

const fieldLabels: Record<
  FillableFieldType,
  string
> = {
  text: 'Text',
  checkbox: 'Checkbox',
  dropdown: 'Dropdown',
  radio: 'Radio',
  date: 'Date',
  signature: 'Signature',
};

const defaultSize = (
  type: FillableFieldType
) => {
  switch (type) {
    case 'checkbox':
      return {
        width: 0.06,
        height: 0.045,
      };

    case 'radio':
      return {
        width: 0.24,
        height: 0.13,
      };

    case 'signature':
      return {
        width: 0.3,
        height: 0.08,
      };

    default:
      return {
        width: 0.28,
        height: 0.045,
      };
  }
};

export const CreateFillablePdf: React.FC<
  CreateFillablePdfProps
> = ({
  file,
  onFileChange,
}) => {
  const [fields, setFields] = useState<
    EditorField[]
  >([]);

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [currentPage, setCurrentPage] =
    useState(1);

  const [totalPages, setTotalPages] =
    useState(1);

  const [zoom, setZoom] =
    useState(1);

  const [pageSize, setPageSize] =
    useState({
      width: 540,
      height: 760,
    });

  const [isRendering, setIsRendering] =
    useState(false);

  const [isProcessing, setIsProcessing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const workspaceRef =
    useRef<HTMLDivElement | null>(null);

  const pdfDocRef = useRef<any>(null);

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  const {
    url: downloadUrl,
    createUrl,
    revoke: revokeDownloadUrl,
  } = useObjectUrl();

  useEffect(() => {
    if (!file) {
      pdfDocRef.current = null;
      setFields([]);
      setSelectedId(null);
      setCurrentPage(1);
      setTotalPages(1);
      setZoom(1);
      revokeDownloadUrl();
      setError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setError(null);

        const bytes =
          await file.arrayBuffer();

        const loadingTask =
          pdfjsLib.getDocument({
            isEvalSupported: false,
            data: new Uint8Array(
              bytes
            ).slice(),
          });

        const pdf =
          await loadingTask.promise;

        if (cancelled) return;

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
        setFields([]);
        setSelectedId(null);
        revokeDownloadUrl();
      } catch (err) {
        console.error(err);

        if (!cancelled) {
          setError(
            'Could not open this PDF. It may be corrupted or password-protected.'
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    if (!pdfDocRef.current) return;

    let cancelled = false;

    (async () => {
      setIsRendering(true);

      try {
        const page =
          await pdfDocRef.current.getPage(
            currentPage
          );

        const base =
          page.getViewport({
            scale: 1,
          });

        const cssWidth = 540;
        const cssHeight =
          cssWidth *
          (base.height /
            base.width);

        if (cancelled) return;

        setPageSize({
          width: cssWidth,
          height: cssHeight,
        });

        const displayWidth =
          cssWidth * zoom;

        const displayHeight =
          cssHeight * zoom;

        const dpr = Math.max(
          window.devicePixelRatio || 1,
          2
        );

        const renderScale =
          (displayWidth / base.width) *
          dpr;

        const viewport =
          page.getViewport({
            scale: renderScale,
          });

        const canvas =
          canvasRef.current;

        if (!canvas) return;

        canvas.width = Math.floor(
          viewport.width
        );

        canvas.height = Math.floor(
          viewport.height
        );

        canvas.style.width =
          `${displayWidth}px`;

        canvas.style.height =
          `${displayHeight}px`;

        const ctx =
          canvas.getContext('2d');

        if (!ctx) return;

        ctx.fillStyle = '#ffffff';

        ctx.fillRect(
          0,
          0,
          canvas.width,
          canvas.height
        );

        await page.render({
          canvasContext: ctx as any,
          viewport,
        } as any).promise;
      } catch (err) {
        console.error(err);

        if (!cancelled) {
          setError(
            'Could not render this PDF page.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    file,
    currentPage,
    zoom,
  ]);

  const clearDownload = () => {
    revokeDownloadUrl();
  };

  const addField = (
    type: FillableFieldType
  ) => {
    const size =
      defaultSize(type);

    const id =
      `${type}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;

    const field: EditorField = {
      id,
      name:
        `${fieldLabels[type]
          .toLowerCase()
          .replace(/\s+/g, '_')}_${fields.length + 1}`,

      type,

      pageIndex:
        currentPage - 1,

      x: 0.2,
      y: 0.2,

      width: size.width,
      height: size.height,

      options:
        type === 'dropdown' ||
        type === 'radio'
          ? [
              'Option 1',
              'Option 2',
            ]
          : undefined,
    };

    setFields((current) => [
      ...current,
      field,
    ]);

    setSelectedId(id);
    clearDownload();
  };

  const updateField = (
    id: string,
    updates: Partial<EditorField>
  ) => {
    setFields((current) =>
      current.map((field) =>
        field.id === id
          ? {
              ...field,
              ...updates,
            }
          : field
      )
    );

    clearDownload();
  };

  const deleteField = (
    id: string
  ) => {
    setFields((current) =>
      current.filter(
        (field) =>
          field.id !== id
      )
    );

    if (selectedId === id) {
      setSelectedId(null);
    }

    clearDownload();
  };

  const handleDragStart = (
    event:
      React.PointerEvent<HTMLDivElement>,
    field: EditorField
  ) => {
    event.stopPropagation();

    const workspace =
      workspaceRef.current;

    if (!workspace) return;

    setSelectedId(field.id);

    const target =
      event.currentTarget;

    target.setPointerCapture?.(
      event.pointerId
    );

    const rect =
      workspace.getBoundingClientRect();

    let lastX =
      event.clientX;

    let lastY =
      event.clientY;

    const move = (
      moveEvent: PointerEvent
    ) => {
      moveEvent.preventDefault();

      const dx =
        (moveEvent.clientX -
          lastX) /
        rect.width;

      const dy =
        (moveEvent.clientY -
          lastY) /
        rect.height;

      lastX =
        moveEvent.clientX;

      lastY =
        moveEvent.clientY;

      setFields((current) =>
        current.map((item) => {
          if (
            item.id !== field.id
          ) {
            return item;
          }

          return {
            ...item,

            x: Math.max(
              0,
              Math.min(
                1 -
                  item.width,
                item.x + dx
              )
            ),

            y: Math.max(
              0,
              Math.min(
                1 -
                  item.height,
                item.y + dy
              )
            ),
          };
        })
      );

      clearDownload();
    };

    const up = (
      upEvent: PointerEvent
    ) => {
      try {
        target.releasePointerCapture?.(
          upEvent.pointerId
        );
      } catch {}

      window.removeEventListener(
        'pointermove',
        move
      );

      window.removeEventListener(
        'pointerup',
        up
      );
    };

    window.addEventListener(
      'pointermove',
      move,
      {
        passive: false,
      }
    );

    window.addEventListener(
      'pointerup',
      up
    );
  };

  const handleResizeStart = (
    event:
      React.PointerEvent<HTMLButtonElement>,
    field: EditorField,
    corner: ResizeCorner
  ) => {
    event.stopPropagation();

    const workspace =
      workspaceRef.current;

    if (!workspace) return;

    setSelectedId(field.id);

    const target =
      event.currentTarget;

    target.setPointerCapture?.(
      event.pointerId
    );

    const rect =
      workspace.getBoundingClientRect();

    let lastX =
      event.clientX;

    let lastY =
      event.clientY;

    const move = (
      moveEvent: PointerEvent
    ) => {
      moveEvent.preventDefault();

      const dx =
        (moveEvent.clientX -
          lastX) /
        rect.width;

      const dy =
        (moveEvent.clientY -
          lastY) /
        rect.height;

      lastX =
        moveEvent.clientX;

      lastY =
        moveEvent.clientY;

      setFields((current) =>
        current.map((item) => {
          if (
            item.id !== field.id
          ) {
            return item;
          }

          let x = item.x;
          let y = item.y;
          let width =
            item.width;
          let height =
            item.height;

          const minW =
            item.type ===
            'checkbox'
              ? 0.025
              : 0.05;

          const minH =
            item.type ===
            'checkbox'
              ? 0.025
              : 0.025;

          if (
            corner.includes('e')
          ) {
            width = Math.max(
              minW,
              Math.min(
                1 - x,
                width + dx
              )
            );
          }

          if (
            corner.includes('w')
          ) {
            const right =
              x + width;

            x = Math.max(
              0,
              Math.min(
                right - minW,
                x + dx
              )
            );

            width =
              right - x;
          }

          if (
            corner.includes('s')
          ) {
            height =
              Math.max(
                minH,
                Math.min(
                  1 - y,
                  height + dy
                )
              );
          }

          if (
            corner.includes('n')
          ) {
            const bottom =
              y + height;

            y = Math.max(
              0,
              Math.min(
                bottom -
                  minH,
                y + dy
              )
            );

            height =
              bottom - y;
          }

          return {
            ...item,
            x,
            y,
            width,
            height,
          };
        })
      );

      clearDownload();
    };

    const up = (
      upEvent: PointerEvent
    ) => {
      try {
        target.releasePointerCapture?.(
          upEvent.pointerId
        );
      } catch {}

      window.removeEventListener(
        'pointermove',
        move
      );

      window.removeEventListener(
        'pointerup',
        up
      );
    };

    window.addEventListener(
      'pointermove',
      move,
      {
        passive: false,
      }
    );

    window.addEventListener(
      'pointerup',
      up
    );
  };

  const createPdf = async () => {
    if (
      !file ||
      fields.length === 0
    ) {
      return;
    }

    setIsProcessing(true);
    setError(null);
    clearDownload();

    try {
      const bytes =
        await createFillablePDF(
          file,
          fields
        );

      const blob =
        new Blob(
          [
            bytes as unknown as BlobPart,
          ],
          {
            type: 'application/pdf',
          }
        );

      createUrl(blob);
    } catch (err: any) {
      console.error(err);

      setError(
        err?.message ||
          'Could not create the fillable PDF.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const activeField =
    fields.find(
      (field) =>
        field.id === selectedId
    ) || null;

  const pageFields =
    fields.filter(
      (field) =>
        field.pageIndex ===
        currentPage - 1
    );

  const removeFile = () => {
    onFileChange(null);
    setFields([]);
    setSelectedId(null);
    revokeDownloadUrl();
    setError(null);
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5 text-left">

      {!file ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() =>
            fileInputRef.current?.click()
          }
          onKeyDown={(event) => {
            if (
              event.key ===
                'Enter' ||
              event.key === ' '
            ) {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(event) =>
            event.preventDefault()
          }
          onDrop={(event) => {
            event.preventDefault();

            const dropped =
              event.dataTransfer
                .files?.[0];

            if (
              dropped?.type ===
              'application/pdf'
            ) {
              onFileChange(dropped);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 rounded-2xl p-12 text-center bg-zinc-950/40 max-w-xl mx-auto transition"
        >
          <FileText className="w-10 h-10 text-emerald-400 mx-auto mb-3" />

          <p className="text-sm font-semibold text-zinc-200">
            Drop a PDF to create fillable fields
          </p>

          <p className="text-xs text-zinc-500 mt-1">
            Add interactive fields directly in your browser
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(event) => {
              const selected =
                event.target
                  .files?.[0];

              if (
                selected?.type ===
                'application/pdf'
              ) {
                onFileChange(selected);
              }

              event.target.value =
                '';
            }}
          />
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 flex flex-wrap gap-2 items-center">

            <button
              type="button"
              onClick={() =>
                addField('text')
              }
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 hover:border-emerald-500/60 flex items-center gap-1.5"
            >
              <Type className="w-4 h-4" />
              Text
            </button>

            <button
              type="button"
              onClick={() =>
                addField(
                  'checkbox'
                )
              }
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 hover:border-emerald-500/60 flex items-center gap-1.5"
            >
              <Square className="w-4 h-4" />
              Checkbox
            </button>

            <button
              type="button"
              onClick={() =>
                addField(
                  'dropdown'
                )
              }
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 hover:border-emerald-500/60 flex items-center gap-1.5"
            >
              <List className="w-4 h-4" />
              Dropdown
            </button>

            <button
              type="button"
              onClick={() =>
                addField('radio')
              }
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 hover:border-emerald-500/60 flex items-center gap-1.5"
            >
              <Circle className="w-4 h-4" />
              Radio
            </button>

            <button
              type="button"
              onClick={() =>
                addField('date')
              }
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 hover:border-emerald-500/60 flex items-center gap-1.5"
            >
              <Calendar className="w-4 h-4" />
              Date
            </button>

            <button
              type="button"
              onClick={() =>
                addField(
                  'signature'
                )
              }
              className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 hover:border-emerald-500/60 flex items-center gap-1.5"
            >
              <PenLine className="w-4 h-4" />
              Signature
            </button>

            <div className="ml-auto flex items-center gap-2">

              <button
                type="button"
                onClick={() =>
                  setCurrentPage(
                    (page) =>
                      Math.max(
                        1,
                        page - 1
                      )
                  )
                }
                disabled={
                  currentPage <= 1
                }
                className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-400 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-mono text-zinc-400">
                Page {currentPage} of{' '}
                {totalPages}
              </span>

              <button
                type="button"
                onClick={() =>
                  setCurrentPage(
                    (page) =>
                      Math.min(
                        totalPages,
                        page + 1
                      )
                  )
                }
                disabled={
                  currentPage >=
                  totalPages
                }
                className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-400 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg px-1">

                <button
                  type="button"
                  onClick={() =>
                    setZoom((value) =>
                      Math.max(
                        0.75,
                        Number(
                          (value - 0.25).toFixed(2)
                        )
                      )
                    )
                  }
                  disabled={zoom <= 0.75}
                  title="Zoom out"
                  className="p-2 text-zinc-400 hover:text-white disabled:opacity-30"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setZoom(1)
                  }
                  title="Reset zoom"
                  className="min-w-[52px] px-1 text-xs font-mono text-zinc-300 hover:text-emerald-400"
                >
                  {Math.round(zoom * 100)}%
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setZoom((value) =>
                      Math.min(
                        2,
                        Number(
                          (value + 0.25).toFixed(2)
                        )
                      )
                    )
                  }
                  disabled={zoom >= 2}
                  title="Zoom in"
                  className="p-2 text-zinc-400 hover:text-white disabled:opacity-30"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

              </div>

              <button
                type="button"
                onClick={
                  removeFile
                }
                title="Close PDF"
                className="p-2 rounded-lg text-zinc-500 hover:text-red-400"
              >
                <X className="w-4 h-4" />
              </button>

            </div>
          </div>

          {activeField && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 flex flex-wrap items-center gap-3">

              <span className="text-xs text-emerald-400 font-semibold">
                {fieldLabels[
                  activeField.type
                ]}
              </span>

              <input
                type="text"
                value={
                  activeField.name
                }
                onChange={(event) =>
                  updateField(
                    activeField.id,
                    {
                      name:
                        event.target
                          .value,
                    }
                  )
                }
                placeholder="Field name"
                className="min-w-[170px] flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              />

              {(activeField.type ===
                'dropdown' ||
                activeField.type ===
                  'radio') && (
                <input
                  type="text"
                  value={
                    activeField.options?.join(
                      ','
                    ) || ''
                  }
                  onChange={(
                    event
                  ) =>
                    updateField(
                      activeField.id,
                      {
                        /*
                         * Keep unfinished values while typing.
                         * Example: "Yes,No," must preserve the
                         * final comma so the user can continue.
                         *
                         * The PDF engine trims/removes empty
                         * options only when exporting.
                         */
                        options:
                          event.target.value.split(','),
                      }
                    )
                  }
                  placeholder="Options: Yes, No, Maybe"
                  className="min-w-[220px] flex-[2] bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              )}

              <button
                type="button"
                onClick={() =>
                  deleteField(
                    activeField.id
                  )
                }
                className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
                title="Delete field"
              >
                <Trash2 className="w-4 h-4" />
              </button>

            </div>
          )}

          <div className="overflow-auto rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3 sm:p-5">

            <div
              ref={workspaceRef}
              onPointerDown={() =>
                setSelectedId(null)
              }
              className="relative mx-auto bg-white shadow-2xl"
              style={{
                width:
                  `${pageSize.width * zoom}px`,
                height:
                  `${pageSize.height * zoom}px`,
              }}
            >

              <canvas
                ref={canvasRef}
                className="absolute inset-0 block"
              />

              {isRendering && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20">
                  <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
                </div>
              )}

              {pageFields.map(
                (field) => {
                  const selected =
                    selectedId ===
                    field.id;

                  return (
                    <div
                      key={
                        field.id
                      }
                      onPointerDown={(
                        event
                      ) =>
                        handleDragStart(
                          event,
                          field
                        )
                      }
                      className={`absolute select-none touch-none cursor-move flex items-center justify-center overflow-hidden ${
                        selected
                          ? 'border-2 border-emerald-500 bg-emerald-500/15'
                          : 'border border-emerald-500/70 bg-emerald-500/10'
                      }`}
                      style={{
                        left:
                          `${field.x * 100}%`,
                        top:
                          `${field.y * 100}%`,
                        width:
                          `${field.width * 100}%`,
                        height:
                          `${field.height * 100}%`,
                      }}
                    >

                      <span className="pointer-events-none text-[10px] font-semibold text-emerald-800 bg-white/80 px-1 rounded truncate max-w-full">
                        {field.type ===
                        'signature'
                          ? 'Sign here'
                          : field.name}
                      </span>

                      {selected &&
                        (
                          [
                            [
                              'nw',
                              '-top-2 -left-2',
                            ],
                            [
                              'ne',
                              '-top-2 -right-2',
                            ],
                            [
                              'se',
                              '-bottom-2 -right-2',
                            ],
                            [
                              'sw',
                              '-bottom-2 -left-2',
                            ],
                          ] as const
                        ).map(
                          ([
                            corner,
                            position,
                          ]) => (
                            <button
                              key={
                                corner
                              }
                              type="button"
                              aria-label={`Resize ${corner}`}
                              onPointerDown={(
                                event
                              ) =>
                                handleResizeStart(
                                  event,
                                  field,
                                  corner
                                )
                              }
                              className={`absolute ${position} w-4 h-4 rounded-full bg-emerald-500 border-2 border-white touch-none`}
                            />
                          )
                        )}

                    </div>
                  );
                }
              )}

            </div>
          </div>

          <div className="text-xs text-zinc-500 text-center">
            Drag fields to position them. Drag the corner handles to resize. Fields on other pages are preserved.
          </div>

          {error && (
            <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-3 flex items-start gap-2 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {!downloadUrl ? (
            <button
              type="button"
              onClick={createPdf}
              disabled={
                isProcessing ||
                fields.length === 0
              }
              className="w-full min-h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating fillable PDF…
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5" />
                  Create Fillable PDF ({fields.length})
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">

              <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-3 flex items-center justify-center gap-2 text-sm text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                Fillable PDF created
              </div>

              <a
                href={downloadUrl}
                download={`fillable_${file.name}`}
                className="w-full min-h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download Fillable PDF
              </a>

            </div>
          )}

        </>
      )}

    </div>
  );
};

export default CreateFillablePdf;
