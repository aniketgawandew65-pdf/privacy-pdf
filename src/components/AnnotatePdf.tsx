import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  Highlighter,
  Loader2,
  MousePointer2,
  PenTool,
  Redo2,
  RotateCcw,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { pdfjsLib } from '../utils/pdfjs';

import {
  annotatePDF,
  type PdfAnnotationItem,
  type PdfAnnotationType,
} from '../utils/pdfEngine';

import { useObjectUrl } from '../utils/useObjectUrl';


interface AnnotatePdfProps {
  file: File | null;
  onFileChange: (
    file: File | null
  ) => void;
}


type Tool =
  | 'select'
  | PdfAnnotationType;


type ResizeHandle =
  | 'nw'
  | 'ne'
  | 'se'
  | 'sw';


const COLORS = [
  '#ef4444',
  '#f59e0b',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#000000',
];


export const AnnotatePdf:
React.FC<AnnotatePdfProps> = ({
  file,
  onFileChange,
}) => {

  const [annotations, setAnnotations] =
    useState<PdfAnnotationItem[]>([]);

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [tool, setTool] =
    useState<Tool>('select');

  const [currentPage, setCurrentPage] =
    useState(1);

  const [totalPages, setTotalPages] =
    useState(1);

  const [zoom, setZoom] =
    useState(1);

  const [pageSize, setPageSize] =
    useState({
      width: 560,
      height: 760,
    });

  const [color, setColor] =
    useState('#ef4444');

  const [strokeWidth, setStrokeWidth] =
    useState(2);

  const [fontSize, setFontSize] =
    useState(16);

  const [isProcessing, setIsProcessing] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [undoStack, setUndoStack] =
    useState<PdfAnnotationItem[][]>([]);

  const [redoStack, setRedoStack] =
    useState<PdfAnnotationItem[][]>([]);


  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null
    );

  const workspaceRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const fileInputRef =
    useRef<HTMLInputElement | null>(
      null
    );


  const {
    url: downloadUrl,
    createUrl,
    revoke: revokeDownloadUrl,
  } = useObjectUrl();


  const selected =
    annotations.find(
      (item) =>
        item.id === selectedId
    ) || null;


  const currentPageAnnotations =
    annotations.filter(
      (item) =>
        item.pageIndex ===
        currentPage - 1
    );


  // ============================================================
  // HISTORY
  // ============================================================

  const saveHistory = () => {
    setUndoStack((previous) =>
      [
        ...previous,
        annotations.map(
          (item) => ({
            ...item,
            points:
              item.points?.map(
                (point) => ({
                  ...point,
                })
              ),
          })
        ),
      ].slice(-40)
    );

    setRedoStack([]);
  };


  const undo = () => {
    if (!undoStack.length) {
      return;
    }

    const previous =
      undoStack[
        undoStack.length - 1
      ];

    setRedoStack((stack) => [
      ...stack,
      annotations,
    ]);

    setAnnotations(previous);

    setUndoStack((stack) =>
      stack.slice(0, -1)
    );

    setSelectedId(null);

    revokeDownloadUrl();
  };


  const redo = () => {
    if (!redoStack.length) {
      return;
    }

    const next =
      redoStack[
        redoStack.length - 1
      ];

    setUndoStack((stack) => [
      ...stack,
      annotations,
    ]);

    setAnnotations(next);

    setRedoStack((stack) =>
      stack.slice(0, -1)
    );

    setSelectedId(null);

    revokeDownloadUrl();
  };


  // ============================================================
  // FILE RESET
  // ============================================================

  useEffect(() => {
    setAnnotations([]);
    setSelectedId(null);
    setCurrentPage(1);
    setTotalPages(1);
    setZoom(1);
    setUndoStack([]);
    setRedoStack([]);
    setErrorMessage(null);
    revokeDownloadUrl();
  }, [file]);


  // ============================================================
  // PDF RENDERING
  // ============================================================

  useEffect(() => {
    if (!file) return;

    let cancelled = false;

    let pdfDocument: any = null;

    const render = async () => {
      try {
        setErrorMessage(null);

        const bytes =
          await file.arrayBuffer();

        const loadingTask =
          pdfjsLib.getDocument({
            isEvalSupported: false,
            data:
              new Uint8Array(
                bytes
              ).slice(),
          });

        pdfDocument =
          await loadingTask.promise;

        if (cancelled) return;

        setTotalPages(
          pdfDocument.numPages
        );

        const safePage =
          Math.min(
            Math.max(
              currentPage,
              1
            ),
            pdfDocument.numPages
          );

        const page =
          await pdfDocument.getPage(
            safePage
          );

        const baseViewport =
          page.getViewport({
            scale: 1,
          });

        const cssWidth = 560;

        const cssHeight =
          cssWidth *
          (
            baseViewport.height /
            baseViewport.width
          );

        if (cancelled) return;

        setPageSize({
          width: cssWidth,
          height: cssHeight,
        });

        const pixelScale =
          Math.max(
            window.devicePixelRatio ||
              1,
            2
          );

        const renderScale =
          (
            cssWidth /
            baseViewport.width
          ) *
          pixelScale;

        const viewport =
          page.getViewport({
            scale: renderScale,
          });

        const canvas =
          canvasRef.current;

        if (!canvas) return;

        canvas.width =
          Math.floor(
            viewport.width
          );

        canvas.height =
          Math.floor(
            viewport.height
          );

        canvas.style.width =
          `${cssWidth}px`;

        canvas.style.height =
          `${cssHeight}px`;

        const context =
          canvas.getContext(
            '2d',
            {
              alpha: false,
            }
          );

        if (!context) return;

        context.fillStyle =
          '#ffffff';

        context.fillRect(
          0,
          0,
          canvas.width,
          canvas.height
        );

        await (
          page.render({
            canvasContext:
              context as any,
            viewport,
          } as any) as any
        ).promise;

        try {
          page.cleanup();
        } catch {}

      } catch (error) {
        console.error(
          'Annotate PDF render error:',
          error
        );

        if (!cancelled) {
          setErrorMessage(
            'Failed to render this PDF.'
          );
        }
      }
    };

    render();

    return () => {
      cancelled = true;

      try {
        pdfDocument?.destroy();
      } catch {}
    };
  }, [
    file,
    currentPage,
  ]);


  // ============================================================
  // KEYBOARD
  // ============================================================

  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent
    ) => {

      const tag =
        (
          document.activeElement
            ?.tagName || ''
        ).toLowerCase();

      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select'
      ) {
        return;
      }

      if (
        event.key ===
          'Delete' ||
        event.key ===
          'Backspace'
      ) {
        if (!selectedId) return;

        event.preventDefault();

        deleteSelected();
      }

      if (
        (
          event.metaKey ||
          event.ctrlKey
        ) &&
        event.key.toLowerCase() ===
          'z'
      ) {
        event.preventDefault();

        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () =>
      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
  });


  // ============================================================
  // HELPERS
  // ============================================================

  const getPoint = (
    clientX: number,
    clientY: number
  ) => {

    const workspace =
      workspaceRef.current;

    if (!workspace) {
      return null;
    }

    const rect =
      workspace.getBoundingClientRect();

    if (
      !rect.width ||
      !rect.height
    ) {
      return null;
    }

    return {
      x:
        Math.max(
          0,
          Math.min(
            1,
            (
              clientX -
              rect.left
            ) /
              rect.width
          )
        ),

      y:
        Math.max(
          0,
          Math.min(
            1,
            (
              clientY -
              rect.top
            ) /
              rect.height
          )
        ),
    };
  };


  const deleteSelected = () => {
    if (!selectedId) return;

    saveHistory();

    setAnnotations(
      (previous) =>
        previous.filter(
          (item) =>
            item.id !==
            selectedId
        )
    );

    setSelectedId(null);

    revokeDownloadUrl();
  };


  const updateSelected = (
    patch:
      Partial<PdfAnnotationItem>
  ) => {
    if (!selectedId) return;

    setAnnotations(
      (previous) =>
        previous.map(
          (item) =>
            item.id ===
            selectedId
              ? {
                  ...item,
                  ...patch,
                }
              : item
        )
    );

    revokeDownloadUrl();
  };


  // ============================================================
  // CREATE / DRAW ANNOTATIONS
  // ============================================================

  const handleWorkspacePointerDown = (
    event:
      React.PointerEvent<HTMLDivElement>
  ) => {

    if (tool === 'select') {
      setSelectedId(null);
      return;
    }

    const start =
      getPoint(
        event.clientX,
        event.clientY
      );

    if (!start) return;

    event.preventDefault();

    const pointerTarget =
      event.currentTarget;

    pointerTarget
      .setPointerCapture?.(
        event.pointerId
      );

    saveHistory();

    const id =
      `${tool}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;


    // ----------------------------------------------------------
    // TEXT
    // ----------------------------------------------------------

    if (tool === 'text') {
      const item:
        PdfAnnotationItem = {

        id,
        type: 'text',

        pageIndex:
          currentPage - 1,

        x:
          Math.min(
            start.x,
            0.72
          ),

        y:
          Math.min(
            start.y,
            0.93
          ),

        width: 0.28,
        height: 0.07,

        text: 'Text',

        color,

        fontSize,
      };

      setAnnotations(
        (previous) => [
          ...previous,
          item,
        ]
      );

      setSelectedId(id);

      setTool('select');

      revokeDownloadUrl();

      return;
    }


    // ----------------------------------------------------------
    // PEN
    // ----------------------------------------------------------

    if (tool === 'pen') {
      const item:
        PdfAnnotationItem = {

        id,
        type: 'pen',

        pageIndex:
          currentPage - 1,

        x: start.x,
        y: start.y,
        width: 0.001,
        height: 0.001,

        color,

        strokeWidth,

        points: [
          {
            x: start.x,
            y: start.y,
          },
        ],
      };

      setAnnotations(
        (previous) => [
          ...previous,
          item,
        ]
      );

      setSelectedId(id);

      const onMove = (
        moveEvent:
          PointerEvent
      ) => {

        moveEvent.preventDefault();

        const point =
          getPoint(
            moveEvent.clientX,
            moveEvent.clientY
          );

        if (!point) return;

        setAnnotations(
          (previous) =>
            previous.map(
              (annotation) => {

                if (
                  annotation.id !==
                  id
                ) {
                  return annotation;
                }

                const points = [
                  ...(
                    annotation.points ||
                    []
                  ),
                  point,
                ];

                const xs =
                  points.map(
                    (p) => p.x
                  );

                const ys =
                  points.map(
                    (p) => p.y
                  );

                const minX =
                  Math.min(...xs);

                const maxX =
                  Math.max(...xs);

                const minY =
                  Math.min(...ys);

                const maxY =
                  Math.max(...ys);

                return {
                  ...annotation,

                  points,

                  x: minX,
                  y: minY,

                  width:
                    Math.max(
                      0.005,
                      maxX - minX
                    ),

                  height:
                    Math.max(
                      0.005,
                      maxY - minY
                    ),
                };
              }
            )
        );

        revokeDownloadUrl();
      };


      const onUp = (
        upEvent:
          PointerEvent
      ) => {

        try {
          pointerTarget
            .releasePointerCapture?.(
              upEvent.pointerId
            );
        } catch {}

        window.removeEventListener(
          'pointermove',
          onMove
        );

        window.removeEventListener(
          'pointerup',
          onUp
        );
      };


      window.addEventListener(
        'pointermove',
        onMove,
        {
          passive: false,
        }
      );

      window.addEventListener(
        'pointerup',
        onUp
      );

      return;
    }


    // ----------------------------------------------------------
    // SHAPES / HIGHLIGHT / ARROW
    // ----------------------------------------------------------

    const item:
      PdfAnnotationItem = {

      id,

      type: tool,

      pageIndex:
        currentPage - 1,

      x: start.x,
      y: start.y,

      width: 0.002,
      height: 0.002,

      color,

      fillColor:
        tool ===
        'highlight'
          ? color
          : undefined,

      opacity:
        tool ===
        'highlight'
          ? 0.28
          : 1,

      strokeWidth,
    };


    setAnnotations(
      (previous) => [
        ...previous,
        item,
      ]
    );

    setSelectedId(id);


    const onMove = (
      moveEvent:
        PointerEvent
    ) => {

      moveEvent.preventDefault();

      const point =
        getPoint(
          moveEvent.clientX,
          moveEvent.clientY
        );

      if (!point) return;

      const left =
        Math.min(
          start.x,
          point.x
        );

      const top =
        Math.min(
          start.y,
          point.y
        );

      const width =
        Math.max(
          0.005,
          Math.abs(
            point.x -
            start.x
          )
        );

      const height =
        Math.max(
          0.005,
          Math.abs(
            point.y -
            start.y
          )
        );

      setAnnotations(
        (previous) =>
          previous.map(
            (annotation) =>
              annotation.id === id
                ? {
                    ...annotation,
                    x: left,
                    y: top,
                    width,
                    height,
                  }
                : annotation
          )
      );

      revokeDownloadUrl();
    };


    const onUp = (
      upEvent:
        PointerEvent
    ) => {

      try {
        pointerTarget
          .releasePointerCapture?.(
            upEvent.pointerId
          );
      } catch {}

      window.removeEventListener(
        'pointermove',
        onMove
      );

      window.removeEventListener(
        'pointerup',
        onUp
      );
    };


    window.addEventListener(
      'pointermove',
      onMove,
      {
        passive: false,
      }
    );

    window.addEventListener(
      'pointerup',
      onUp
    );
  };


  // ============================================================
  // MOVE
  // ============================================================

  const handleItemPointerDown = (
    event:
      React.PointerEvent,
    item:
      PdfAnnotationItem
  ) => {

    if (tool !== 'select') {
      return;
    }

    event.preventDefault();

    event.stopPropagation();

    setSelectedId(item.id);

    saveHistory();

    const target =
      event.currentTarget as
        HTMLElement;

    target.setPointerCapture?.(
      event.pointerId
    );

    const workspace =
      workspaceRef.current;

    if (!workspace) return;

    const rect =
      workspace
        .getBoundingClientRect();

    let lastX =
      event.clientX;

    let lastY =
      event.clientY;


    const onMove = (
      moveEvent:
        PointerEvent
    ) => {

      moveEvent.preventDefault();

      const dx =
        (
          moveEvent.clientX -
          lastX
        ) /
        rect.width;

      const dy =
        (
          moveEvent.clientY -
          lastY
        ) /
        rect.height;

      lastX =
        moveEvent.clientX;

      lastY =
        moveEvent.clientY;


      setAnnotations(
        (previous) =>
          previous.map(
            (annotation) => {

              if (
                annotation.id !==
                item.id
              ) {
                return annotation;
              }


              // PEN MOVE
              if (
                annotation.type ===
                  'pen' &&
                annotation.points
              ) {

                const minDx =
                  -annotation.x;

                const maxDx =
                  1 -
                  (
                    annotation.x +
                    annotation.width
                  );

                const minDy =
                  -annotation.y;

                const maxDy =
                  1 -
                  (
                    annotation.y +
                    annotation.height
                  );

                const safeDx =
                  Math.max(
                    minDx,
                    Math.min(
                      maxDx,
                      dx
                    )
                  );

                const safeDy =
                  Math.max(
                    minDy,
                    Math.min(
                      maxDy,
                      dy
                    )
                  );

                return {
                  ...annotation,

                  x:
                    annotation.x +
                    safeDx,

                  y:
                    annotation.y +
                    safeDy,

                  points:
                    annotation.points.map(
                      (point) => ({
                        x:
                          point.x +
                          safeDx,

                        y:
                          point.y +
                          safeDy,
                      })
                    ),
                };
              }


              const newX =
                Math.max(
                  0,
                  Math.min(
                    1 -
                      annotation.width,

                    annotation.x +
                      dx
                  )
                );

              const newY =
                Math.max(
                  0,
                  Math.min(
                    1 -
                      annotation.height,

                    annotation.y +
                      dy
                  )
                );

              return {
                ...annotation,
                x: newX,
                y: newY,
              };
            }
          )
      );

      revokeDownloadUrl();
    };


    const onUp = (
      upEvent:
        PointerEvent
    ) => {

      try {
        target
          .releasePointerCapture?.(
            upEvent.pointerId
          );
      } catch {}

      window.removeEventListener(
        'pointermove',
        onMove
      );

      window.removeEventListener(
        'pointerup',
        onUp
      );
    };


    window.addEventListener(
      'pointermove',
      onMove,
      {
        passive: false,
      }
    );

    window.addEventListener(
      'pointerup',
      onUp
    );
  };


  // ============================================================
  // RESIZE
  // ============================================================

  const handleResizePointerDown = (
    event:
      React.PointerEvent,
    item:
      PdfAnnotationItem,
    handle:
      ResizeHandle
  ) => {

    event.preventDefault();

    event.stopPropagation();

    if (
      item.type === 'pen'
    ) {
      return;
    }

    saveHistory();

    const target =
      event.currentTarget as
        HTMLElement;

    target.setPointerCapture?.(
      event.pointerId
    );

    const workspace =
      workspaceRef.current;

    if (!workspace) return;

    const rect =
      workspace
        .getBoundingClientRect();

    let lastX =
      event.clientX;

    let lastY =
      event.clientY;

    const minWidth =
      0.015;

    const minHeight =
      0.01;


    const onMove = (
      moveEvent:
        PointerEvent
    ) => {

      moveEvent.preventDefault();

      const dx =
        (
          moveEvent.clientX -
          lastX
        ) /
        rect.width;

      const dy =
        (
          moveEvent.clientY -
          lastY
        ) /
        rect.height;

      lastX =
        moveEvent.clientX;

      lastY =
        moveEvent.clientY;


      setAnnotations(
        (previous) =>
          previous.map(
            (annotation) => {

              if (
                annotation.id !==
                item.id
              ) {
                return annotation;
              }

              let x =
                annotation.x;

              let y =
                annotation.y;

              let width =
                annotation.width;

              let height =
                annotation.height;


              if (
                handle.includes(
                  'e'
                )
              ) {
                width =
                  Math.max(
                    minWidth,
                    Math.min(
                      1 - x,
                      width + dx
                    )
                  );
              }


              if (
                handle.includes(
                  'w'
                )
              ) {
                const right =
                  x + width;

                x =
                  Math.max(
                    0,
                    Math.min(
                      right -
                        minWidth,
                      x + dx
                    )
                  );

                width =
                  right - x;
              }


              if (
                handle.includes(
                  's'
                )
              ) {
                height =
                  Math.max(
                    minHeight,
                    Math.min(
                      1 - y,
                      height + dy
                    )
                  );
              }


              if (
                handle.includes(
                  'n'
                )
              ) {
                const bottom =
                  y + height;

                y =
                  Math.max(
                    0,
                    Math.min(
                      bottom -
                        minHeight,
                      y + dy
                    )
                  );

                height =
                  bottom - y;
              }


              return {
                ...annotation,
                x,
                y,
                width,
                height,
              };
            }
          )
      );

      revokeDownloadUrl();
    };


    const onUp = (
      upEvent:
        PointerEvent
    ) => {

      try {
        target
          .releasePointerCapture?.(
            upEvent.pointerId
          );
      } catch {}

      window.removeEventListener(
        'pointermove',
        onMove
      );

      window.removeEventListener(
        'pointerup',
        onUp
      );
    };


    window.addEventListener(
      'pointermove',
      onMove,
      {
        passive: false,
      }
    );

    window.addEventListener(
      'pointerup',
      onUp
    );
  };


  // ============================================================
  // EXPORT
  // ============================================================

  const handleExport =
    async () => {

    if (!file) return;

    if (!annotations.length) {
      setErrorMessage(
        'Add at least one annotation first.'
      );

      return;
    }

    setIsProcessing(true);

    setErrorMessage(null);

    revokeDownloadUrl();

    try {
      const bytes =
        await annotatePDF(
          file,
          annotations
        );

      const blob =
        new Blob(
          [
            bytes as unknown as
              BlobPart,
          ],
          {
            type:
              'application/pdf',
          }
        );

      createUrl(blob);

    } catch (error: any) {

      console.error(
        'Annotate PDF export error:',
        error
      );

      setErrorMessage(
        error?.message ||
        'Failed to create annotated PDF.'
      );

    } finally {

      setIsProcessing(false);
    }
  };


  // ============================================================
  // UPLOAD SCREEN
  // ============================================================

  if (!file) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"

          onChange={(event) => {
            const nextFile =
              event.target
                .files?.[0];

            if (nextFile) {
              onFileChange(
                nextFile
              );
            }

            event.currentTarget.value =
              '';
          }}
        />

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-8 sm:p-12 text-center">

          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">

            <PenTool className="w-7 h-7 text-emerald-400" />

          </div>

          <h2 className="text-xl sm:text-2xl font-semibold text-white mb-2">
            Annotate PDF
          </h2>

          <p className="text-sm text-zinc-400 max-w-xl mx-auto mb-7">
            Add text, highlights, drawings, shapes and arrows directly to your PDF. Processing stays in your browser.
          </p>

          <button
            type="button"
            onClick={() =>
              fileInputRef.current?.click()
            }
            className="inline-flex items-center gap-2 min-h-12 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold transition"
          >
            <Upload className="w-4 h-4" />
            Choose PDF
          </button>

        </div>
      </div>
    );
  }


  const resizeHandles: {
    type: ResizeHandle;
    className: string;
    cursor: string;
  }[] = [
    {
      type: 'nw',
      className:
        '-top-1.5 -left-1.5',
      cursor:
        'nwse-resize',
    },
    {
      type: 'ne',
      className:
        '-top-1.5 -right-1.5',
      cursor:
        'nesw-resize',
    },
    {
      type: 'se',
      className:
        '-bottom-1.5 -right-1.5',
      cursor:
        'nwse-resize',
    },
    {
      type: 'sw',
      className:
        '-bottom-1.5 -left-1.5',
      cursor:
        'nesw-resize',
    },
  ];


  // ============================================================
  // MAIN EDITOR
  // ============================================================

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-5 py-6">

      <div className="flex flex-col gap-4">


        {/* HEADER */}
        <div className="flex items-center justify-between gap-3">

          <div>
            <h2 className="text-xl font-semibold text-white">
              Annotate PDF
            </h2>

            <p className="text-xs text-zinc-500 mt-1">
              Annotations are flattened into the downloaded PDF for reliable viewing.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              onFileChange(null)
            }
            className="p-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900"
            title="Close PDF"
          >
            <X className="w-4 h-4" />
          </button>

        </div>


        {/* TOOLBAR */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3">

          <div className="flex items-center gap-2 overflow-x-auto pb-1">

            <ToolButton
              active={
                tool === 'select'
              }
              label="Select"
              onClick={() =>
                setTool(
                  'select'
                )
              }
            >
              <MousePointer2 className="w-4 h-4" />
            </ToolButton>


            <ToolButton
              active={
                tool === 'text'
              }
              label="Text"
              onClick={() =>
                setTool('text')
              }
            >
              <Type className="w-4 h-4" />
            </ToolButton>


            <ToolButton
              active={
                tool === 'pen'
              }
              label="Pen"
              onClick={() =>
                setTool('pen')
              }
            >
              <PenTool className="w-4 h-4" />
            </ToolButton>


            <ToolButton
              active={
                tool ===
                'highlight'
              }
              label="Highlight"
              onClick={() =>
                setTool(
                  'highlight'
                )
              }
            >
              <Highlighter className="w-4 h-4" />
            </ToolButton>


            <ToolButton
              active={
                tool ===
                'rectangle'
              }
              label="Rectangle"
              onClick={() =>
                setTool(
                  'rectangle'
                )
              }
            >
              <Square className="w-4 h-4" />
            </ToolButton>


            <ToolButton
              active={
                tool ===
                'ellipse'
              }
              label="Circle"
              onClick={() =>
                setTool(
                  'ellipse'
                )
              }
            >
              <Circle className="w-4 h-4" />
            </ToolButton>


            <ToolButton
              active={
                tool ===
                'arrow'
              }
              label="Arrow"
              onClick={() =>
                setTool(
                  'arrow'
                )
              }
            >
              <ArrowUpRight className="w-4 h-4" />
            </ToolButton>


            <div className="w-px h-8 bg-zinc-800 shrink-0 mx-1" />


            <button
              type="button"
              onClick={undo}
              disabled={
                !undoStack.length
              }
              className="p-2.5 shrink-0 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"
              title="Undo"
            >
              <Undo2 className="w-4 h-4" />
            </button>


            <button
              type="button"
              onClick={redo}
              disabled={
                !redoStack.length
              }
              className="p-2.5 shrink-0 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"
              title="Redo"
            >
              <Redo2 className="w-4 h-4" />
            </button>


            <button
              type="button"
              onClick={
                deleteSelected
              }
              disabled={
                !selectedId
              }
              className="p-2.5 shrink-0 rounded-xl border border-zinc-800 text-zinc-400 hover:text-red-400 disabled:opacity-30"
              title="Delete selected"
            >
              <Trash2 className="w-4 h-4" />
            </button>

          </div>


          {/* STYLE CONTROLS */}
          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-zinc-800">

            <span className="text-xs text-zinc-500">
              Color
            </span>

            <div className="flex items-center gap-1.5">

              {COLORS.map(
                (swatch) => (
                  <button
                    key={swatch}
                    type="button"

                    onClick={() => {
                      setColor(
                        swatch
                      );

                      if (
                        selected
                      ) {
                        saveHistory();

                        updateSelected({
                          color:
                            swatch,

                          ...(selected.type ===
                          'highlight'
                            ? {
                                fillColor:
                                  swatch,
                              }
                            : {}),
                        });
                      }
                    }}

                    style={{
                      backgroundColor:
                        swatch,
                    }}

                    className={`w-6 h-6 rounded-full border-2 ${
                      color ===
                      swatch
                        ? 'border-white'
                        : 'border-zinc-700'
                    }`}
                  />
                )
              )}

              <input
                type="color"
                value={color}

                onChange={(event) =>
                  setColor(
                    event.target
                      .value
                  )
                }

                className="w-7 h-7 bg-transparent cursor-pointer"
                title="Custom color"
              />

            </div>


            <div className="w-px h-6 bg-zinc-800" />


            <label className="flex items-center gap-2 text-xs text-zinc-500">

              Thickness

              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={
                  strokeWidth
                }

                onChange={(
                  event
                ) => {
                  const value =
                    Number(
                      event.target
                        .value
                    );

                  setStrokeWidth(
                    value
                  );
                }}

                className="w-24"
              />

              <span className="font-mono text-zinc-300 min-w-[18px]">
                {strokeWidth}
              </span>

            </label>

          </div>

        </div>


        {/* SELECTED TEXT SETTINGS */}
        {selected?.type ===
          'text' && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 flex flex-col sm:flex-row gap-3">

            <input
              value={
                selected.text ||
                ''
              }

              onFocus={() => {
                saveHistory();
              }}

              onChange={(
                event
              ) =>
                updateSelected({
                  text:
                    event.target
                      .value,
                })
              }

              className="flex-1 min-h-11 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm text-white outline-none focus:border-emerald-500"
              placeholder="Annotation text"
            />

            <label className="flex items-center gap-2 text-xs text-zinc-400">

              Size

              <input
                type="number"
                min="6"
                max="72"

                value={
                  selected.fontSize ||
                  fontSize
                }

                onFocus={() => {
                  saveHistory();
                }}

                onChange={(
                  event
                ) => {

                  const value =
                    Math.max(
                      6,
                      Math.min(
                        72,
                        Number(
                          event.target
                            .value
                        ) || 16
                      )
                    );

                  setFontSize(
                    value
                  );

                  updateSelected({
                    fontSize:
                      value,
                  });
                }}

                className="w-20 min-h-11 rounded-xl border border-zinc-800 bg-zinc-900 px-2 text-white"
              />

            </label>

          </div>
        )}


        {/* ERROR */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex gap-2 text-xs text-red-300">

            <AlertCircle className="w-4 h-4 shrink-0" />

            <span>
              {errorMessage}
            </span>

          </div>
        )}


        {/* SUCCESS */}
        {downloadUrl && (
          <div className="p-3 rounded-xl border border-emerald-800/40 bg-emerald-950/30 text-xs text-emerald-400 flex items-center justify-center gap-2">

            <CheckCircle2 className="w-4 h-4" />

            Annotated PDF created successfully.

          </div>
        )}


        {/* PAGE BAR */}
        <div className="flex items-center justify-between gap-3">

          <div className="flex items-center gap-2">

            <button
              type="button"

              disabled={
                currentPage <= 1
              }

              onClick={() =>
                setCurrentPage(
                  (page) =>
                    Math.max(
                      1,
                      page - 1
                    )
                )
              }

              className="p-2 rounded-lg border border-zinc-800 text-zinc-400 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>


            <span className="text-xs text-zinc-400 min-w-[90px] text-center">

              Page {currentPage} of {totalPages}

            </span>


            <button
              type="button"

              disabled={
                currentPage >=
                totalPages
              }

              onClick={() =>
                setCurrentPage(
                  (page) =>
                    Math.min(
                      totalPages,
                      page + 1
                    )
                )
              }

              className="p-2 rounded-lg border border-zinc-800 text-zinc-400 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

          </div>


          <span className="text-xs text-zinc-500">

            {annotations.length} annotation{annotations.length === 1 ? '' : 's'}

          </span>

        </div>


        {/* WORKSPACE */}
        <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">

          <div className="overflow-auto min-h-[620px] p-5 sm:p-8">

            <div
              style={{
                width:
                  pageSize.width *
                  zoom,

                height:
                  pageSize.height *
                  zoom,
              }}

              className="relative mx-auto"
            >

              <div
                style={{
                  width:
                    pageSize.width,

                  height:
                    pageSize.height,

                  transform:
                    `scale(${zoom})`,

                  transformOrigin:
                    'top left',
                }}

                className="absolute top-0 left-0 bg-white shadow-2xl"
              >

                <canvas
                  ref={canvasRef}
                  className="block"
                />


                <div
                  ref={workspaceRef}

                  onPointerDown={
                    handleWorkspacePointerDown
                  }

                  style={{
                    touchAction:
                      tool ===
                      'select'
                        ? 'pan-x pan-y'
                        : 'none',

                    cursor:
                      tool ===
                      'select'
                        ? 'default'
                        : 'crosshair',
                  }}

                  className="absolute inset-0 select-none"
                >


                  {/* PEN DRAWINGS */}
                  {currentPageAnnotations
                    .filter(
                      (item) =>
                        item.type ===
                        'pen'
                    )
                    .map(
                      (item) => {

                        const isSelected =
                          item.id ===
                          selectedId;

                        return (
                          <React.Fragment
                            key={
                              item.id
                            }
                          >

                            <svg
                              viewBox="0 0 100 100"
                              preserveAspectRatio="none"
                              className="absolute inset-0 w-full h-full pointer-events-none"
                            >

                              <polyline
                                points={
                                  item.points
                                    ?.map(
                                      (
                                        point
                                      ) =>
                                        `${point.x * 100},${point.y * 100}`
                                    )
                                    .join(
                                      ' '
                                    ) ||
                                  ''
                                }

                                fill="none"

                                stroke={
                                  item.color ||
                                  '#ef4444'
                                }

                                strokeWidth={
                                  Math.max(
                                    0.15,
                                    (
                                      item.strokeWidth ||
                                      2
                                    ) *
                                      0.16
                                  )
                                }

                                strokeLinecap="round"
                                strokeLinejoin="round"
                                vectorEffect="non-scaling-stroke"
                              />

                            </svg>


                            <div
                              onPointerDown={(
                                event
                              ) =>
                                handleItemPointerDown(
                                  event,
                                  item
                                )
                              }

                              style={{
                                left:
                                  `${item.x * 100}%`,

                                top:
                                  `${item.y * 100}%`,

                                width:
                                  `${item.width * 100}%`,

                                height:
                                  `${item.height * 100}%`,

                                touchAction:
                                  'none',
                              }}

                              className={`absolute ${
                                isSelected
                                  ? 'border border-emerald-500'
                                  : 'border border-transparent'
                              }`}
                            />

                          </React.Fragment>
                        );
                      }
                    )}


                  {/* OTHER ANNOTATIONS */}
                  {currentPageAnnotations
                    .filter(
                      (item) =>
                        item.type !==
                        'pen'
                    )
                    .map(
                      (item) => {

                        const isSelected =
                          item.id ===
                          selectedId;


                        let content:
                          React.ReactNode =
                          null;


                        if (
                          item.type ===
                          'text'
                        ) {
                          content = (
                            <div
                              style={{
                                color:
                                  item.color ||
                                  '#ef4444',

                                fontSize:
                                  `${
                                    item.fontSize ||
                                    16
                                  }px`,

                                lineHeight:
                                  1.15,
                              }}

                              className="w-full h-full overflow-hidden whitespace-pre-wrap p-0.5"
                            >
                              {item.text ||
                                ''}
                            </div>
                          );
                        }


                        if (
                          item.type ===
                          'highlight'
                        ) {
                          content = (
                            <div
                              style={{
                                background:
                                  item.fillColor ||
                                  item.color ||
                                  '#eab308',

                                opacity:
                                  item.opacity ??
                                  0.28,
                              }}

                              className="w-full h-full"
                            />
                          );
                        }


                        if (
                          item.type ===
                          'rectangle'
                        ) {
                          content = (
                            <div
                              style={{
                                border:
                                  `${
                                    item.strokeWidth ||
                                    2
                                  }px solid ${
                                    item.color ||
                                    '#ef4444'
                                  }`,
                              }}

                              className="w-full h-full"
                            />
                          );
                        }


                        if (
                          item.type ===
                          'ellipse'
                        ) {
                          content = (
                            <div
                              style={{
                                border:
                                  `${
                                    item.strokeWidth ||
                                    2
                                  }px solid ${
                                    item.color ||
                                    '#ef4444'
                                  }`,
                              }}

                              className="w-full h-full rounded-[50%]"
                            />
                          );
                        }


                        if (
                          item.type ===
                          'arrow'
                        ) {
                          content = (
                            <svg
                              viewBox="0 0 100 100"
                              preserveAspectRatio="none"
                              className="w-full h-full overflow-visible"
                            >

                              <defs>
                                <marker
                                  id={`arrow-${item.id}`}
                                  markerWidth="7"
                                  markerHeight="7"
                                  refX="5"
                                  refY="3.5"
                                  orient="auto"
                                >
                                  <polygon
                                    points="0 0, 7 3.5, 0 7"
                                    fill={
                                      item.color ||
                                      '#ef4444'
                                    }
                                  />
                                </marker>
                              </defs>

                              <line
                                x1="2"
                                y1="2"
                                x2="96"
                                y2="96"

                                stroke={
                                  item.color ||
                                  '#ef4444'
                                }

                                strokeWidth={
                                  Math.max(
                                    1,
                                    item.strokeWidth ||
                                    2
                                  )
                                }

                                vectorEffect="non-scaling-stroke"

                                markerEnd={`url(#arrow-${item.id})`}
                              />

                            </svg>
                          );
                        }


                        return (
                          <div
                            key={
                              item.id
                            }

                            onPointerDown={(
                              event
                            ) =>
                              handleItemPointerDown(
                                event,
                                item
                              )
                            }

                            style={{
                              left:
                                `${item.x * 100}%`,

                              top:
                                `${item.y * 100}%`,

                              width:
                                `${item.width * 100}%`,

                              height:
                                `${item.height * 100}%`,

                              touchAction:
                                'none',

                              zIndex:
                                isSelected
                                  ? 30
                                  : 10,
                            }}

                            className={`absolute ${
                              tool ===
                              'select'
                                ? 'cursor-move'
                                : ''
                            } ${
                              isSelected
                                ? 'ring-1 ring-emerald-500'
                                : ''
                            }`}
                          >

                            {content}


                            {isSelected &&
                              item.type !==
                                'pen' &&
                              resizeHandles.map(
                                (
                                  handle
                                ) => (

                                  <div
                                    key={
                                      handle.type
                                    }

                                    onPointerDown={(
                                      event
                                    ) =>
                                      handleResizePointerDown(
                                        event,
                                        item,
                                        handle.type
                                      )
                                    }

                                    style={{
                                      cursor:
                                        handle.cursor,

                                      touchAction:
                                        'none',
                                    }}

                                    className={`absolute w-3 h-3 bg-white border-2 border-emerald-500 rounded-full shadow-lg z-40 ${handle.className}`}
                                  />

                                )
                              )}

                          </div>
                        );
                      }
                    )}

                </div>

              </div>

            </div>

          </div>


          {/* ZOOM */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-zinc-950/95 border border-zinc-800 rounded-xl p-1.5 shadow-xl">

            <button
              type="button"

              onClick={() =>
                setZoom(
                  (value) =>
                    Math.max(
                      0.5,
                      Number(
                        (
                          value -
                          0.15
                        ).toFixed(
                          2
                        )
                      )
                    )
                )
              }

              className="p-1.5 rounded-lg text-zinc-400 hover:text-white"
            >
              <ZoomOut className="w-4 h-4" />
            </button>


            <span className="min-w-[44px] text-center text-[11px] font-mono text-zinc-400">
              {Math.round(
                zoom * 100
              )}%
            </span>


            <button
              type="button"

              onClick={() =>
                setZoom(
                  (value) =>
                    Math.min(
                      2.5,
                      Number(
                        (
                          value +
                          0.15
                        ).toFixed(
                          2
                        )
                      )
                    )
                )
              }

              className="p-1.5 rounded-lg text-zinc-400 hover:text-white"
            >
              <ZoomIn className="w-4 h-4" />
            </button>


            <button
              type="button"
              onClick={() =>
                setZoom(1)
              }
              className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400"
              title="Reset zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

          </div>

        </div>


        {/* EXPORT */}
        <div className="flex flex-col sm:flex-row gap-3">

          <button
            type="button"
            disabled={
              isProcessing ||
              !annotations.length
            }

            onClick={
              handleExport
            }

            className="flex-1 min-h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-semibold flex items-center justify-center gap-2"
          >

            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating PDF...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Create Annotated PDF
              </>
            )}

          </button>


          {downloadUrl && (
            <a
              href={downloadUrl}
              download="annotated.pdf"

              className="flex-1 min-h-12 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-semibold flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </a>
          )}

        </div>

      </div>
    </div>
  );
};


// ============================================================================
// TOOL BUTTON
// ============================================================================

interface ToolButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
  children:
    React.ReactNode;
}


const ToolButton:
React.FC<ToolButtonProps> = ({
  active,
  label,
  onClick,
  children,
}) => {

  return (
    <button
      type="button"
      onClick={onClick}

      className={`shrink-0 min-h-10 px-3 rounded-xl border flex items-center gap-2 text-xs font-medium transition ${
        active
          ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-400'
          : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-white'
      }`}
    >
      {children}
      {label}
    </button>
  );
};


export default AnnotatePdf;
