import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Hand,
  ChevronLeft,
  ChevronRight,
  Square,
  Type,
  X,
  FileEdit,
  CheckCircle2,
  AlertCircle,
  Save,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { loadPdfJsFromBlob } from '../utils/pdfjs';
import {
  applyVisualOverlays,
  type VisualOverlayItem,
} from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';
import { getLicenseStatus } from '../utils/license';
import { useDesktopCapacityRecommendation } from '../hooks/useDesktopCapacityRecommendation';
import { DesktopCapacityStatus } from './DesktopCapacityStatus';
import {
  checkTaskCredit,
  commitTaskCredit,
} from '../utils/taskCreditGate';

import {
  preserveProcessingWorkspace,
  clearProcessingRecovery,
} from '../utils/localProcessing';

import {
  saveToolWorkspaceFiles,
  restoreToolWorkspaceFiles,
  saveToolWorkspaceState,
  restoreToolWorkspaceState,
  clearToolWorkspace,
} from '../utils/localWorkspace';

interface VisualEditorProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

type ResizeHandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';


const EDIT_PDF_SCOPE =
  'edit-pdf-session';

const EDIT_PDF_OUTPUT_SCOPE =
  'edit-pdf-session-output';


type EditPdfSessionState = {
  version: 1;

  file: {
    name: string;
    size: number;
    lastModified: number;
  };

  items: VisualOverlayItem[];

  currentPage: number;

  zoom: number;

  selectedId: string | null;

  isPanMode: boolean;

  savedItemsSignature:
    string |
    null;
};


const editPdfFileKey =
  (
    file:
      File
  ) =>
    [
      file.name,
      file.size,
      file.lastModified ||
        0,
    ].join(
      '::'
    );


const editPdfStateMatchesFile =
  (
    state:
      EditPdfSessionState |
      null,

    file:
      File
  ) =>
    Boolean(
      state &&
      state.version ===
        1 &&
      state.file.name ===
        file.name &&
      state.file.size ===
        file.size &&
      state.file.lastModified ===
        (
          file.lastModified ||
          0
        )
    );


const editItemsSignature =
  (
    items:
      VisualOverlayItem[]
  ) =>
    JSON.stringify(
      items
    );


const cloneEditItems =
  (
    items:
      VisualOverlayItem[]
  ):
    VisualOverlayItem[] =>
      items.map(
        (
          item
        ) => ({
          ...item,
        })
      );

export const VisualEditor: React.FC<VisualEditorProps> = ({ file, onFileChange }) => {
  const [items, setItems] = useState<VisualOverlayItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [zoom, setZoom] = useState<number>(1.0);
  const [isPanMode, setIsPanMode] = useState<boolean>(false);


  const [
    savedItemsSignature,
    setSavedItemsSignature,
  ] =
    useState<
      string |
      null
    >(
      null
    );


  /*
   * Prevent fresh default React state from overwriting a
   * recovered edit session before restoration is complete.
   */
  const stateReadyFileKeyRef =
    useRef<
      string |
      null
    >(
      null
    );


  /*
   * A component mount with file=null may be Safari recreating
   * the page. Restore the Edit PDF source only once.
   */
  const sourceRestoreAttemptedRef =
    useRef(
      false
    );


  // The editor always uses a stable 500px-wide coordinate system.
  // Only the outer visual scale changes.
  const [pageDisplayHeight, setPageDisplayHeight] = useState<number>(700);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /*
   * ==========================================================
   * LARGE EDIT-PDF PAGE NAVIGATION
   * ==========================================================
   *
   * Keep one PDF.js document alive for the selected file.
   * Changing Page 1 -> 2 -> 3 must NOT reopen a 150 MB PDF
   * every time.
   */
  const pdfSessionRef =
    useRef<{
      pdf: any;
      dispose: () => Promise<void>;
    } | null>(
      null
    );

  const activeRenderTaskRef =
    useRef<any>(
      null
    );

  const activeRenderedPageRef =
    useRef<any>(
      null
    );

  const renderRequestRef =
    useRef(
      0
    );

  const [
    pdfSessionVersion,
    setPdfSessionVersion,
  ] =
    useState(
      0
    );

  // Preserve viewport position while the mobile keyboard opens/closes.
  const mobileFocusScrollRef = useRef<{
    x: number;
    y: number;
    canvasLeft: number;
    canvasTop: number;
  } | null>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  const { recommendation: desktopCapacityRecommendation } =
    useDesktopCapacityRecommendation({
      toolId: 'edit-pdf',
      selectedBytes: file?.size ?? 0,
      pageCount:
        totalPages > 0
          ? totalPages
          : null,
      enabled:
        Boolean(file) &&
        getLicenseStatus().isPro,
    });


  useEffect(() => {
    if (!file) {
      return;
    }


    preserveProcessingWorkspace();


    const handleIntentionalUnload =
      () => {
        /*
         * A real user refresh should start a fresh editor
         * session. Unexpected WebContent termination never gets
         * the chance to execute this handler.
         */
        clearProcessingRecovery();
      };


    window.addEventListener(
      'beforeunload',
      handleIntentionalUnload
    );


    return () => {
      window.removeEventListener(
        'beforeunload',
        handleIntentionalUnload
      );


      /*
       * Normal navigation to another 1into1 tool must not leave
       * a global processing marker behind.
       *
       * The actual Edit PDF source/state remains in its isolated
       * tool workspace and will restore when the user returns.
       */
      clearProcessingRecovery();
    };
  }, [
    file,
  ]);


  /*
   * If Safari recreated the page there may be no File left in
   * App React memory. Restore the dedicated Edit PDF source.
   *
   * Small delay lets App.tsx finish a genuine hard-refresh reset
   * before we inspect this workspace.
   */
  useEffect(() => {
    if (
      file ||
      sourceRestoreAttemptedRef.current
    ) {
      return;
    }


    sourceRestoreAttemptedRef.current =
      true;


    let cancelled =
      false;


    const timer =
      window.setTimeout(
        () => {
          void (
            async () => {
              try {
                const restored =
                  await restoreToolWorkspaceFiles(
                    EDIT_PDF_SCOPE
                  );


                if (
                  cancelled ||
                  restored.length ===
                    0
                ) {
                  return;
                }


                onFileChange(
                  restored[0]
                );
              } catch (
                restoreError
              ) {
                console.warn(
                  'Unable to restore Edit PDF source:',
                  restoreError
                );
              }
            }
          )();
        },
        220
      );


    return () => {
      cancelled =
        true;

      window.clearTimeout(
        timer
      );
    };
  }, [
    file,
    onFileChange,
  ]);


  // Mobile Safari:
  // 1. 16px inputs prevent automatic browser zoom.
  // 2. Restore the document position after the keyboard closes.
  useEffect(() => {
    document.documentElement.classList.add('visual-editor-open');

    const isMobile = () =>
      window.matchMedia('(max-width: 767px)').matches;

    const isFormControl = (target: EventTarget | null) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;

    const handleFocusIn = (event: FocusEvent) => {
      if (!isMobile() || !isFormControl(event.target)) return;

      const canvasScroller = canvasScrollRef.current;

      mobileFocusScrollRef.current = {
        x: window.scrollX,
        y: window.scrollY,
        canvasLeft: canvasScroller?.scrollLeft ?? 0,
        canvasTop: canvasScroller?.scrollTop ?? 0,
      };
    };

    const restoreScroll = () => {
      if (!isMobile()) return;

      const saved = mobileFocusScrollRef.current;
      if (!saved) return;

      window.scrollTo({
        left: saved.x,
        top: saved.y,
        behavior: 'auto',
      });

      const canvasScroller = canvasScrollRef.current;

      if (canvasScroller) {
        canvasScroller.scrollLeft = saved.canvasLeft;
        canvasScroller.scrollTop = saved.canvasTop;
      }
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (!isMobile() || !isFormControl(event.target)) return;

      // iOS changes the visual viewport in stages while
      // closing its keyboard, so restore twice.
      window.setTimeout(restoreScroll, 80);
      window.setTimeout(restoreScroll, 320);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.documentElement.classList.remove('visual-editor-open');

      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Keyboard Delete & Sub-Pixel Arrow Key Nudging
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      // Delete item
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteItem(selectedId);
        return;
      }

      // Nudge position with arrow keys (Shift = 5x step, Normal = single pixel precision)
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 0.006 : 0.0012; // 0.0012 gives ~0.6px micro-control on canvas
        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== selectedId) return item;
            let newX = item.x;
            let newY = item.y;
            if (e.key === 'ArrowLeft') newX = Math.max(0, item.x - step);
            if (e.key === 'ArrowRight') newX = Math.min(1 - item.width, item.x + step);
            if (e.key === 'ArrowUp') newY = Math.max(0, item.y - step);
            if (e.key === 'ArrowDown') newY = Math.min(1 - item.height, item.y + step);
            return { ...item, x: newX, y: newY };
          })
        );
        revokeDownloadUrl();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  /*
   * ==========================================================
   * OPEN SOURCE PDF ONCE
   * ==========================================================
   *
   * Previous behaviour reopened PDF.js whenever currentPage
   * changed. Large iPhone documents could therefore overlap
   * document teardown/re-open with a new canvas allocation.
   *
   * Now the selected source is opened once per File.
   */
  useEffect(() => {
    let cancelled =
      false;


    const stopCurrentRender =
      async () => {
        const task =
          activeRenderTaskRef.current;

        activeRenderTaskRef.current =
          null;


        if (task) {
          try {
            task.cancel?.();
          } catch (_) {}

          try {
            await task.promise;
          } catch (_) {}
        }


        const page =
          activeRenderedPageRef.current;

        activeRenderedPageRef.current =
          null;


        if (page) {
          try {
            page.cleanup();
          } catch (_) {}
        }
      };


    const openSource =
      async () => {
        /*
         * Release any session belonging to the previous file.
         */
        await stopCurrentRender();


        const previousSession =
          pdfSessionRef.current;

        pdfSessionRef.current =
          null;


        if (previousSession) {
          try {
            await previousSession.dispose();
          } catch (_) {}
        }


        if (!file) {
          if (!cancelled) {
            stateReadyFileKeyRef.current =
              null;


            setItems([]);
            setSelectedId(
              null
            );
            setCurrentPage(
              1
            );
            setTotalPages(
              1
            );
            revokeDownloadUrl();
          }

          return;
        }


        try {
          /*
           * ==================================================
           * DURABLE EDIT-PDF SOURCE
           * ==================================================
           *
           * App intentionally does NOT mirror /edit-pdf through
           * the generic workspace because a simultaneous 150 MB
           * OPFS write + PDF.js render previously caused iPhone
           * memory pressure.
           *
           * Therefore Edit PDF owns one isolated source copy.
           *
           * Finish that write BEFORE PDF.js opens the document.
           */
          const sourceStored =
            await saveToolWorkspaceFiles(
              EDIT_PDF_SCOPE,
              [
                file,
              ]
            );


          if (!sourceStored) {
            console.warn(
              'Edit PDF restart recovery source could not be persisted.'
            );
          }


          const fileKey =
            editPdfFileKey(
              file
            );


          const persisted =
            restoreToolWorkspaceState<
              EditPdfSessionState
            >(
              EDIT_PDF_SCOPE
            );


          if (
            editPdfStateMatchesFile(
              persisted,
              file
            ) &&
            persisted
          ) {
            const restoredItems =
              cloneEditItems(
                persisted.items ||
                  []
              );


            stateReadyFileKeyRef.current =
              fileKey;


            setItems(
              restoredItems
            );


            setCurrentPage(
              Math.max(
                1,
                persisted.currentPage ||
                  1
              )
            );


            setZoom(
              Math.max(
                0.5,
                Math.min(
                  2.5,
                  persisted.zoom ||
                    1
                )
              )
            );


            setIsPanMode(
              Boolean(
                persisted.isPanMode
              )
            );


            const restoredSelectedId =
              persisted.selectedId &&
              restoredItems.some(
                (
                  item
                ) =>
                  item.id ===
                  persisted.selectedId
              )
                ? persisted.selectedId
                : null;


            setSelectedId(
              restoredSelectedId
            );


            setSavedItemsSignature(
              persisted.savedItemsSignature ||
                null
            );
          } else {
            /*
             * New/different source selected in Edit PDF.
             * Do not let edits/output from the previous source
             * leak into it.
             */
            await clearToolWorkspace(
              EDIT_PDF_OUTPUT_SCOPE
            ).catch(
              () => {}
            );


            stateReadyFileKeyRef.current =
              fileKey;


            setItems(
              []
            );

            setSelectedId(
              null
            );

            setCurrentPage(
              1
            );

            setZoom(
              1
            );

            setIsPanMode(
              false
            );

            setSavedItemsSignature(
              null
            );


            saveToolWorkspaceState<
              EditPdfSessionState
            >(
              EDIT_PDF_SCOPE,
              {
                version:
                  1,

                file: {
                  name:
                    file.name,

                  size:
                    file.size,

                  lastModified:
                    file.lastModified ||
                    0,
                },

                items:
                  [],

                currentPage:
                  1,

                zoom:
                  1,

                selectedId:
                  null,

                isPanMode:
                  false,

                savedItemsSignature:
                  null,
              }
            );
          }


          const loaded =
            await loadPdfJsFromBlob(
              file,
              {
                stopAtErrors:
                  false,
              }
            );


          if (cancelled) {
            await loaded.dispose();
            return;
          }


          pdfSessionRef.current =
            loaded;


          setTotalPages(
            loaded.pdf.numPages
          );


          setCurrentPage(
            (
              current
            ) =>
              Math.max(
                1,
                Math.min(
                  current,
                  loaded.pdf
                    .numPages
                )
              )
          );


          /*
           * Signal the page-render effect that the persistent
           * PDF session is ready.
           */
          setPdfSessionVersion(
            (
              version
            ) =>
              version +
              1
          );


          setErrorMessage(
            null
          );
        } catch (err: any) {
          console.error(
            'PDF open error:',
            err
          );

          if (!cancelled) {
            setErrorMessage(
              'Failed to open PDF.'
            );
          }
        }
      };


    void openSource();


    return () => {
      cancelled =
        true;

      renderRequestRef.current +=
        1;


      const task =
        activeRenderTaskRef.current;

      activeRenderTaskRef.current =
        null;


      if (task) {
        try {
          task.cancel?.();
        } catch (_) {}
      }


      const page =
        activeRenderedPageRef.current;

      activeRenderedPageRef.current =
        null;


      if (page) {
        try {
          page.cleanup();
        } catch (_) {}
      }


      const session =
        pdfSessionRef.current;

      pdfSessionRef.current =
        null;


      if (session) {
        void session
          .dispose()
          .catch(
            () => {}
          );
      }
    };
  }, [file]);


  /*
   * ==========================================================
   * RENDER PAGE FROM THE EXISTING PDF SESSION
   * ==========================================================
   */
  useEffect(() => {
    if (
      !file ||
      !pdfSessionRef.current
    ) {
      return;
    }


    let cancelled =
      false;

    const requestId =
      ++renderRequestRef.current;


    /*
     * Tiny debounce:
     * Page 1 -> 2 -> 3 from quick taps should render only the
     * final requested page instead of allocating three canvases.
     */
    const timer =
      window.setTimeout(
        () => {
          void (
            async () => {
              try {
                /*
                 * Fully settle/cancel the previous canvas render
                 * before touching the same canvas again.
                 */
                const previousTask =
                  activeRenderTaskRef.current;

                activeRenderTaskRef.current =
                  null;


                if (previousTask) {
                  try {
                    previousTask.cancel?.();
                  } catch (_) {}

                  try {
                    await previousTask.promise;
                  } catch (_) {}
                }


                const previousPage =
                  activeRenderedPageRef.current;

                activeRenderedPageRef.current =
                  null;


                if (previousPage) {
                  try {
                    previousPage.cleanup();
                  } catch (_) {}
                }


                if (
                  cancelled ||
                  requestId !==
                    renderRequestRef.current
                ) {
                  return;
                }


                const session =
                  pdfSessionRef.current;

                if (!session) {
                  return;
                }


                const page =
                  await session.pdf.getPage(
                    currentPage
                  );


                if (
                  cancelled ||
                  requestId !==
                    renderRequestRef.current
                ) {
                  try {
                    page.cleanup();
                  } catch (_) {}

                  return;
                }


                activeRenderedPageRef.current =
                  page;


                const baseViewport =
                  page.getViewport({
                    scale: 1,
                  });


                /*
                 * 1.4x mobile is intentional.
                 *
                 * Pixel memory compared with the old 2x:
                 * (1.4 / 2)^2 ~= 49%
                 *
                 * The visible editor is only 500 CSS px wide,
                 * so 1.4x remains sufficiently sharp for editing
                 * while being substantially safer on iPhone.
                 */
                const isMobileRender =
                  window.matchMedia(
                    '(max-width: 767px)'
                  ).matches;


                const preferredScale =
                  isMobileRender
                    ? 1.4
                    : 2.0;


                const maxRenderDimension =
                  isMobileRender
                    ? 1600
                    : 2400;


                const dimensionScale =
                  maxRenderDimension /
                  Math.max(
                    baseViewport.width,
                    baseViewport.height
                  );


                const renderScale =
                  Math.max(
                    1,
                    Math.min(
                      preferredScale,
                      dimensionScale
                    )
                  );


                const viewport =
                  page.getViewport({
                    scale:
                      renderScale,
                  });


                /*
                 * Logical editing geometry remains fixed at
                 * 500px. Only backing pixels changed.
                 */
                setPageDisplayHeight(
                  500 *
                    (
                      viewport.height /
                      viewport.width
                    )
                );


                const canvas =
                  canvasRef.current;

                if (!canvas) {
                  return;
                }


                /*
                 * Explicitly drop the previous backing store
                 * before allocating the next page.
                 */
                canvas.width =
                  1;

                canvas.height =
                  1;


                await new Promise<void>(
                  (
                    resolve
                  ) =>
                    requestAnimationFrame(
                      () =>
                        resolve()
                    )
                );


                if (
                  cancelled ||
                  requestId !==
                    renderRequestRef.current
                ) {
                  return;
                }


                canvas.width =
                  Math.max(
                    1,
                    Math.floor(
                      viewport.width
                    )
                  );

                canvas.height =
                  Math.max(
                    1,
                    Math.floor(
                      viewport.height
                    )
                  );


                const ctx =
                  canvas.getContext(
                    '2d',
                    {
                      alpha:
                        false,
                    }
                  );


                if (!ctx) {
                  throw new Error(
                    'Canvas rendering context unavailable'
                  );
                }


                const renderTask =
                  page.render({
                    canvasContext:
                      ctx as any,
                    viewport,
                  } as any);


                activeRenderTaskRef.current =
                  renderTask;


                await renderTask.promise;


                if (
                  cancelled ||
                  requestId !==
                    renderRequestRef.current
                ) {
                  return;
                }


                setErrorMessage(
                  null
                );
              } catch (err: any) {
                if (
                  err?.name !==
                    'RenderingCancelledException' &&
                  !cancelled &&
                  requestId ===
                    renderRequestRef.current
                ) {
                  console.error(
                    'Render error:',
                    err
                  );

                  setErrorMessage(
                    'Failed to render PDF page.'
                  );
                }
              } finally {
                if (
                  requestId ===
                    renderRequestRef.current
                ) {
                  activeRenderTaskRef.current =
                    null;


                  const page =
                    activeRenderedPageRef.current;

                  activeRenderedPageRef.current =
                    null;


                  if (page) {
                    try {
                      page.cleanup();
                    } catch (_) {}
                  }
                }
              }
            }
          )();
        },
        80
      );


    return () => {
      cancelled =
        true;

      window.clearTimeout(
        timer
      );


      /*
       * Cancel immediately when the user requests another page.
       * The next render waits for this task to settle.
       */
      const task =
        activeRenderTaskRef.current;

      if (task) {
        try {
          task.cancel?.();
        } catch (_) {}
      }
    };
  }, [
    file,
    currentPage,
    pdfSessionVersion,
  ]);


  useEffect(() => {
    if (!file) {
      return;
    }


    const fileKey =
      editPdfFileKey(
        file
      );


    if (
      stateReadyFileKeyRef.current !==
      fileKey
    ) {
      return;
    }


    const timer =
      window.setTimeout(
        () => {
          saveToolWorkspaceState<
            EditPdfSessionState
          >(
            EDIT_PDF_SCOPE,
            {
              version:
                1,

              file: {
                name:
                  file.name,

                size:
                  file.size,

                lastModified:
                  file.lastModified ||
                  0,
              },

              items:
                cloneEditItems(
                  items
                ),

              currentPage,

              zoom,

              selectedId,

              isPanMode,

              savedItemsSignature,
            }
          );
        },
        50
      );


    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [
    file,
    items,
    currentPage,
    zoom,
    selectedId,
    isPanMode,
    savedItemsSignature,
  ]);


  /*
   * If the user changes any edit AFTER creating the output PDF,
   * that old output must not reappear after navigation.
   */
  useEffect(() => {
    if (
      !savedItemsSignature
    ) {
      return;
    }


    const currentSignature =
      editItemsSignature(
        items
      );


    if (
      currentSignature ===
      savedItemsSignature
    ) {
      return;
    }


    setSavedItemsSignature(
      null
    );


    revokeDownloadUrl();


    void clearToolWorkspace(
      EDIT_PDF_OUTPUT_SCOPE
    ).catch(
      () => {}
    );
  }, [
    items,
    savedItemsSignature,
    revokeDownloadUrl,
  ]);


  /*
   * Restore an already-created edited PDF after:
   *
   * - PDF Preview -> Back
   * - Safari process recreation
   * - moving to another 1into1 tool and returning
   *
   * This prevents forcing another Save operation / task charge.
   */
  useEffect(() => {
    if (
      !file ||
      !savedItemsSignature ||
      downloadUrl ||
      editItemsSignature(
        items
      ) !==
        savedItemsSignature
    ) {
      return;
    }


    let cancelled =
      false;


    void (
      async () => {
        try {
          const outputs =
            await restoreToolWorkspaceFiles(
              EDIT_PDF_OUTPUT_SCOPE
            );


          if (
            cancelled ||
            outputs.length ===
              0
          ) {
            return;
          }


          const output =
            outputs[0];


          if (
            output.name !==
            `edited_${file.name}`
          ) {
            return;
          }


          createUrl(
            output
          );
        } catch (
          outputRestoreError
        ) {
          console.warn(
            'Unable to restore edited PDF output:',
            outputRestoreError
          );
        }
      }
    )();


    return () => {
      cancelled =
        true;
    };
  }, [
    file,
    items,
    savedItemsSignature,
    downloadUrl,
    createUrl,
  ]);


  const handleAddWhiteout = () => {
    const newItem: VisualOverlayItem = {
      id: `whiteout-${Date.now()}`,
      type: 'whiteout',
      pageIndex: currentPage - 1,
      x: 0.25,
      y: 0.25,
      width: 0.2,
      height: 0.03,
    };
    setItems((prev) => [...prev, newItem]);
    setSelectedId(newItem.id);
    revokeDownloadUrl();
  };

  const handleAddText = () => {
    const newItem: VisualOverlayItem = {
      id: `text-${Date.now()}`,
      type: 'text',
      pageIndex: currentPage - 1,
      x: 0.25,
      y: 0.25,
      width: 0.3,
      height: 0.035,
      text: 'Replace text here',
      fontFamily: 'helvetica',
      fontSize: 12,
      color: '#000000',
      hasBackground: true,
      fitMode: 'wrap',
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrikethrough: false,
    };
    setItems((prev) => [...prev, newItem]);
    setSelectedId(newItem.id);
    revokeDownloadUrl();
  };

  const handleUpdateItem = (id: string, updates: Partial<VisualOverlayItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
    revokeDownloadUrl();
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (selectedId === id) setSelectedId(null);
    revokeDownloadUrl();
  };

  const handleApplyChanges = async () => {
    if (!file || items.length === 0) return;

    const creditCheck =
      checkTaskCredit(file);

    if (!creditCheck.allowed) {
      setErrorMessage(
        creditCheck.errorMessage ||
          'This task is not available on your current plan.'
      );
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      let outputBytes:
        Uint8Array |
        null =
          await applyVisualOverlays(
            file,
            items
          );


      const blob =
        new Blob(
          [
            outputBytes as
              unknown as
              BlobPart,
          ],
          {
            type:
              'application/pdf',
          }
        );


      /*
       * Drop the direct JS reference before the browser-local
       * output persistence phase.
       */
      outputBytes =
        null;


      await new Promise<void>(
        (
          resolve
        ) =>
          setTimeout(
            resolve,
            0
          )
      );


      const outputFile =
        new File(
          [
            blob,
          ],
          `edited_${file.name}`,
          {
            type:
              'application/pdf',

            lastModified:
              Date.now(),
          }
        );


      const outputStored =
        await saveToolWorkspaceFiles(
          EDIT_PDF_OUTPUT_SCOPE,
          [
            outputFile,
          ]
        );


      const signature =
        editItemsSignature(
          items
        );


      if (outputStored) {
        setSavedItemsSignature(
          signature
        );


        /*
         * Persist the successful output relationship
         * synchronously before the user can open PDF Preview.
         */
        saveToolWorkspaceState<
          EditPdfSessionState
        >(
          EDIT_PDF_SCOPE,
          {
            version:
              1,

            file: {
              name:
                file.name,

              size:
                file.size,

              lastModified:
                file.lastModified ||
                0,
            },

            items:
              cloneEditItems(
                items
              ),

            currentPage,

            zoom,

            selectedId,

            isPanMode,

            savedItemsSignature:
              signature,
          }
        );
      } else {
        console.warn(
          'Edited PDF output could not be persisted for Preview/Back recovery.'
        );
      }


      createUrl(
        outputFile
      );


      commitTaskCredit();
    } catch (err: any) {
      console.error('Export error:', err);
      setErrorMessage(err.message || 'Failed to save modifications.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Delta-based Drag Move
  const handleDragPointerDown = (e: React.PointerEvent, item: VisualOverlayItem) => {
    e.stopPropagation();
    setSelectedId(item.id);

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);

    const workspace = workspaceRef.current;
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    let lastX = e.clientX;
    let lastY = e.clientY;

    const onPointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const dx = (moveEvent.clientX - lastX) / rect.width;
      const dy = (moveEvent.clientY - lastY) / rect.height;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;

      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== item.id) return it;
          const newX = Math.max(0, Math.min(1 - it.width, it.x + dx));
          const newY = Math.max(0, Math.min(1 - it.height, it.y + dy));
          return { ...it, x: newX, y: newY };
        })
      );
      revokeDownloadUrl();
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        target.releasePointerCapture?.(upEvent.pointerId);
      } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
  };

  // Delta-based Resize
  const handleResizePointerDown = (
    e: React.PointerEvent,
    item: VisualOverlayItem,
    handle: ResizeHandleType
  ) => {
    e.stopPropagation();
    setSelectedId(item.id);

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);

    const workspace = workspaceRef.current;
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    let lastX = e.clientX;
    let lastY = e.clientY;
    const minW = 0.01;
    const minH = 0.008;

    const onPointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const dx = (moveEvent.clientX - lastX) / rect.width;
      const dy = (moveEvent.clientY - lastY) / rect.height;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;

      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== item.id) return it;
          let newX = it.x;
          let newY = it.y;
          let newW = it.width;
          let newH = it.height;

          if (handle.includes('e')) {
            newW = Math.max(minW, Math.min(1 - it.x, it.width + dx));
          }
          if (handle.includes('w')) {
            const right = it.x + it.width;
            newX = Math.max(0, Math.min(right - minW, it.x + dx));
            newW = right - newX;
          }
          if (handle.includes('s')) {
            newH = Math.max(minH, Math.min(1 - it.y, it.height + dy));
          }
          if (handle.includes('n')) {
            const bottom = it.y + it.height;
            newY = Math.max(0, Math.min(bottom - minH, it.y + dy));
            newH = bottom - newY;
          }

          return { ...it, x: newX, y: newY, width: newW, height: newH };
        })
      );
      revokeDownloadUrl();
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        target.releasePointerCapture?.(upEvent.pointerId);
      } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
  };

  // PDF page can move only when Pan mode is explicitly enabled.
  const handlePanPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanMode) return;

    const scroller = canvasScrollRef.current;
    if (!scroller) return;

    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = scroller.scrollLeft;
    const startTop = scroller.scrollTop;

    const onPointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();

      scroller.scrollLeft =
        startLeft - (moveEvent.clientX - startX);

      scroller.scrollTop =
        startTop - (moveEvent.clientY - startY);
    };

    const finish = (upEvent: PointerEvent) => {
      try {
        target.releasePointerCapture?.(upEvent.pointerId);
      } catch {}

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };

    window.addEventListener(
      'pointermove',
      onPointerMove,
      { passive: false }
    );

    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const handleChooseFile =
    async (
      nextFile:
        File
    ) => {
      /*
       * User intentionally selected a replacement PDF.
       * Remove only the previous Edit PDF session.
       */
      await Promise.all([
        clearToolWorkspace(
          EDIT_PDF_SCOPE
        ).catch(
          () => {}
        ),

        clearToolWorkspace(
          EDIT_PDF_OUTPUT_SCOPE
        ).catch(
          () => {}
        ),
      ]);


      stateReadyFileKeyRef.current =
        null;

      sourceRestoreAttemptedRef.current =
        true;

      setSavedItemsSignature(
        null
      );

      revokeDownloadUrl();


      onFileChange(
        nextFile
      );
    };


  const handleClearEditor =
    async () => {
      if (
        isProcessing
      ) {
        return;
      }


      sourceRestoreAttemptedRef.current =
        true;

      stateReadyFileKeyRef.current =
        null;


      clearProcessingRecovery();


      revokeDownloadUrl();


      await Promise.all([
        clearToolWorkspace(
          EDIT_PDF_SCOPE
        ).catch(
          () => {}
        ),

        clearToolWorkspace(
          EDIT_PDF_OUTPUT_SCOPE
        ).catch(
          () => {}
        ),
      ]);


      setItems(
        []
      );

      setSelectedId(
        null
      );

      setCurrentPage(
        1
      );

      setZoom(
        1
      );

      setIsPanMode(
        false
      );

      setSavedItemsSignature(
        null
      );

      setErrorMessage(
        null
      );


      onFileChange(
        null
      );
    };


  const currentPageItems = items.filter((item) => item.pageIndex === currentPage - 1);
  const activeItem = items.find((i) => i.id === selectedId);

  // Unobstructed 4-Corner Handles
  const CORNER_HANDLES: { type: ResizeHandleType; cursor: string; className: string }[] = [
    { type: 'nw', cursor: 'nwse-resize', className: '-top-1 -left-1' },
    { type: 'ne', cursor: 'nesw-resize', className: '-top-1 -right-1' },
    { type: 'se', cursor: 'nwse-resize', className: '-bottom-1 -right-1' },
    { type: 'sw', cursor: 'nesw-resize', className: '-bottom-1 -left-1' },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 text-left">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0];

            if (
              dropped &&
              dropped.type ===
                'application/pdf'
            ) {
              void handleChooseFile(
                dropped
              );
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-2xl p-12 text-center bg-zinc-950/40 max-w-xl mx-auto"
        >
          <FileEdit className="w-10 h-10 text-emerald-400 mx-auto mb-3 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF to Edit (Replace Text or Erase)</p>
          <p className="text-xs text-zinc-500 mt-1">Millimeter hairline precision • Arrow key micro-nudging • Zero data egress</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selected =
                e.target.files?.[0];


              if (
                selected &&
                selected.type ===
                  'application/pdf'
              ) {
                void handleChooseFile(
                  selected
                );
              }


              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <>
          {desktopCapacityRecommendation && (
            <DesktopCapacityStatus
              recommendation={desktopCapacityRecommendation}
            />
          )}

          {/* Top Controls */}
          <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-3.5 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddText}
                className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Type className="w-3.5 h-3.5" />
                <span>+ Text &amp; Erase Box</span>
              </button>
              <button
                onClick={handleAddWhiteout}
                className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 text-zinc-400 fill-white" />
                <span>+ Blank Eraser Box</span>
              </button>
            </div>

            {/* Pagination */}
            <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800 text-xs text-zinc-300">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] px-1">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next Page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Save & Close */}
            <div className="flex items-center gap-2">
              {!downloadUrl ? (
                <button
                  onClick={handleApplyChanges}
                  disabled={isProcessing || items.length === 0}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Applying edits...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Save Edits ({items.length})</span>
                    </>
                  )}
                </button>
              ) : (
                <a
                  href={downloadUrl}
                  download={`edited_${file.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-500/20"
                >
                  <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Download Edited PDF</span>
                </a>
              )}
              <button
                onClick={() =>
                  void handleClearEditor()
                }
                disabled={
                  isProcessing
                }
                className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Remove file and clear Edit PDF session"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Configuration Tray */}
          {activeItem && (
            <div className="visual-editor-config bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="visual-editor-config-controls flex flex-wrap items-center gap-3 flex-1 min-w-[320px]">
                <span className="text-zinc-400 font-medium capitalize">{activeItem.type}:</span>

                {activeItem.type === 'text' && (
                  <>
                    <input
                      type="text"
                      value={activeItem.text || ''}
                      onChange={(e) => handleUpdateItem(activeItem.id, { text: e.target.value })}
                      placeholder="Type replacement text..."
                      className="visual-editor-text-input flex-1 min-w-[150px] md:min-w-[260px] lg:min-w-[320px] bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-emerald-500"
                    />

                    {/* Font Selector */}
                    <div className="visual-editor-font-select bg-zinc-950 px-2 py-1 rounded-lg border border-zinc-800">
                      <select
                        value={activeItem.fontFamily || 'helvetica'}
                        onChange={(e) =>
                          handleUpdateItem(activeItem.id, { fontFamily: e.target.value as any })
                        }
                        className="bg-transparent text-zinc-200 focus:outline-none cursor-pointer text-xs"
                      >
                        <option value="helvetica" className="bg-zinc-900">Sans (Helvetica)</option>
                        <option value="times" className="bg-zinc-900">Serif (Times)</option>
                        <option value="courier" className="bg-zinc-900">Mono (Courier)</option>
                      </select>
                    </div>

                    {/* Text Styling: Bold, Italic, Underline, Strikethrough */}
                    <div className="visual-editor-button-group flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(activeItem.id, { isBold: !activeItem.isBold })}
                        className={`w-7 h-6 rounded flex items-center justify-center text-xs font-bold transition-colors cursor-pointer ${
                          activeItem.isBold
                            ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Bold"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(activeItem.id, { isItalic: !activeItem.isItalic })}
                        className={`w-7 h-6 rounded flex items-center justify-center text-xs italic font-serif transition-colors cursor-pointer ${
                          activeItem.isItalic
                            ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Italic"
                      >
                        I
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(activeItem.id, { isUnderline: !activeItem.isUnderline })}
                        className={`w-7 h-6 rounded flex items-center justify-center text-xs underline underline-offset-2 transition-colors cursor-pointer ${
                          activeItem.isUnderline
                            ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Underline"
                      >
                        U
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(activeItem.id, { isStrikethrough: !activeItem.isStrikethrough })}
                        className={`w-7 h-6 rounded flex items-center justify-center text-xs line-through transition-colors cursor-pointer ${
                          activeItem.isStrikethrough
                            ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Strikethrough (Cross-out)"
                      >
                        S
                      </button>
                    </div>

                    {/* Text Alignment */}
                    <div className="visual-editor-button-group flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(activeItem.id, { textAlign: 'left' })}
                        className={`w-7 h-6 rounded flex items-center justify-center transition-colors ${
                          (activeItem.textAlign || 'left') === 'left'
                            ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Align left"
                      >
                        <AlignLeft size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateItem(activeItem.id, { textAlign: 'center' })}
                        className={`w-7 h-6 rounded flex items-center justify-center transition-colors ${
                          activeItem.textAlign === 'center'
                            ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Align center"
                      >
                        <AlignCenter size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateItem(activeItem.id, { textAlign: 'right' })}
                        className={`w-7 h-6 rounded flex items-center justify-center transition-colors ${
                          activeItem.textAlign === 'right'
                            ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Align right"
                      >
                        <AlignRight size={14} />
                      </button>
                    </div>

                    {/* Fit Mode Switcher */}
                    <div className="visual-editor-fit-group flex items-center p-0.5 bg-zinc-950 border border-zinc-800 rounded-lg text-[11px]">
                      <button
                        onClick={() => handleUpdateItem(activeItem.id, { fitMode: 'wrap' })}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          (activeItem.fitMode || 'wrap') === 'wrap'
                            ? 'bg-zinc-800 text-emerald-400 font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Wrap Text
                      </button>
                      <button
                        onClick={() => handleUpdateItem(activeItem.id, { fitMode: 'autofit' })}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          activeItem.fitMode === 'autofit'
                            ? 'bg-zinc-800 text-emerald-400 font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Auto-fit
                      </button>
                    </div>

                    {/* Synchronized Slider & Numeric Input */}
                    {(activeItem.fitMode || 'wrap') === 'wrap' && (
                      <div className="visual-editor-size-control flex items-center gap-1.5 bg-zinc-950 px-2 py-1 rounded-lg border border-zinc-800 text-zinc-400">
                        <span>Size:</span>
                        <input
                          type="range"
                          min="1"
                          max="72"
                          value={activeItem.fontSize || 12}
                          onChange={(e) =>
                            handleUpdateItem(activeItem.id, { fontSize: Number(e.target.value) })
                          }
                          className="w-14 accent-emerald-500 cursor-pointer"
                        />
                        <input
                          type="number"
                          min="1"
                          max="72"
                          value={activeItem.fontSize || 12}
                          onChange={(e) => {
                            const val = Math.max(1, Math.min(72, Number(e.target.value) || 1));
                            handleUpdateItem(activeItem.id, { fontSize: val });
                          }}
                          className="w-11 bg-zinc-900 border border-zinc-800 text-emerald-400 rounded px-1 py-0.5 font-mono text-center text-xs"
                        />
                        <span className="text-[10px] text-zinc-500">pt</span>
                      </div>
                    )}

                    <label className="visual-editor-erase-toggle flex items-center gap-1.5 text-zinc-300 cursor-pointer select-none bg-zinc-950 px-2 py-1 rounded-lg border border-zinc-800">
                      <input
                        type="checkbox"
                        checked={activeItem.hasBackground ?? true}
                        onChange={(e) =>
                          handleUpdateItem(activeItem.id, { hasBackground: e.target.checked })
                        }
                        className="accent-emerald-500 rounded"
                      />
                      <span>Erase Underneath</span>
                    </label>

                    <input
                      type="color"
                      value={activeItem.color || '#000000'}
                      onChange={(e) => handleUpdateItem(activeItem.id, { color: e.target.value })}
                      className="visual-editor-color-input w-7 h-7 rounded border border-zinc-800 bg-transparent cursor-pointer"
                      title="Select text color"
                    />
                  </>
                )}

                {activeItem.type === 'whiteout' && (
                  <span className="text-zinc-400 text-[11px]">
                    Drag to move • Corner handles to scale • Use <b>Arrow Keys</b> for 1px precision • <b>Del</b> to remove
                  </span>
                )}
              </div>

              <button
                onClick={() => handleDeleteItem(activeItem.id)}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Delete (or press Delete key)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {downloadUrl && (
            <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-800/30 font-medium">
              <CheckCircle2 className="w-4 h-4" /> Edits Successfully Saved into PDF
            </div>
          )}

          {/* Canvas Workspace */}
          <div
            onClick={() => setSelectedId(null)}
            className="relative bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-xl shadow-2xl h-[700px] overflow-hidden flex flex-col"
          >
            <div className="p-3 border-b border-zinc-800 text-xs text-zinc-400 flex items-center justify-between bg-zinc-950/40">
              <span>PDF Canvas (Page {currentPage})</span>
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5"
              >
                <span className="hidden sm:inline text-zinc-500 mr-2">
                  {currentPageItems.length} active
                </span>

                {/* Explicit Pan Mode */}
                <button
                  type="button"
                  onClick={() => {
                    setIsPanMode((current) => !current);
                    setSelectedId(null);
                  }}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isPanMode
                      ? 'bg-emerald-500 text-black'
                      : 'hover:bg-zinc-800 hover:text-white'
                  }`}
                  title={isPanMode ? "Exit Pan Mode" : "Pan PDF"}
                  aria-pressed={isPanMode}
                >
                  <Hand className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-zinc-800 mx-0.5" />

                <button
                  type="button"
                  onClick={() =>
                    setZoom((z) =>
                      Math.max(
                        0.5,
                        Number((z - 0.15).toFixed(2))
                      )
                    )
                  }
                  className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-white transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                <span className="text-[11px] font-mono px-1 text-zinc-400 min-w-[42px] text-center">
                  {Math.round(zoom * 100)}%
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setZoom((z) =>
                      Math.min(
                        2.5,
                        Number((z + 0.15).toFixed(2))
                      )
                    )
                  }
                  className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-white transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-zinc-800" />

                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-emerald-400 transition-colors"
                  title="Reset Zoom"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div
              ref={canvasScrollRef}
              onPointerDown={handlePanPointerDown}
              className={`flex-1 p-3 sm:p-6 bg-zinc-950/60 overscroll-contain ${
                isPanMode
                  ? 'overflow-auto cursor-grab active:cursor-grabbing'
                  : 'overflow-hidden cursor-default'
              }`}
              style={{
                touchAction: 'none',
              }}
            >
              {/* 
                  ZOOM SIZER

                  This outer box tells the scroll container the REAL
                  visual size of the zoomed PDF.

                  The PDF itself keeps one permanent coordinate system,
                  so Text and Whiteout overlays never shift.
              */}
              <div
                style={{
                  width: `${500 * zoom}px`,
                  height: `${pageDisplayHeight * zoom}px`,
                  margin:
                    zoom <= 1
                      ? '0 auto'
                      : '0',
                  position: 'relative',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '500px',
                    height: `${pageDisplayHeight}px`,
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left',
                  }}
                  className="relative shadow-2xl rounded-sm border border-zinc-800/80 bg-white"
                >
                  <canvas
                  ref={canvasRef}
                  style={{
                    width: '500px',
                    height: 'auto',
                    display: 'block',
                  }}
                />

                {/* Overlay Interactive Elements */}
                <div
                  ref={workspaceRef}
                  className={`absolute inset-0 select-none overflow-hidden ${
                    isPanMode ? 'pointer-events-none' : ''
                  }`}
                >
                  {currentPageItems.map((item) => {
                    const isSelected = item.id === selectedId;
                    const isText = item.type === 'text';

                    let fontFamilyCss = 'Arial, sans-serif';
                    if (item.fontFamily === 'times') fontFamilyCss = "'Times New Roman', Times, serif";
                    if (item.fontFamily === 'courier') fontFamilyCss = "'Courier New', Courier, monospace";

                    const effectiveFontSize =
                      isText && item.fitMode === 'autofit'
                        ? Math.max(
                            6,
                            Math.min(
                              item.height * pageDisplayHeight * 0.7,
                              (item.width * 500) / Math.max(1, (item.text || 'Text').length * 0.58)
                            )
                          )
                        : (item.fontSize || 12) * 0.9;

                    return (
                      <div
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(item.id);
                        }}
                        style={{
                          left: `${item.x * 100}%`,
                          top: `${item.y * 100}%`,
                          width: `${item.width * 100}%`,
                          height: `${item.height * 100}%`,
                          zIndex: isText ? 20 : 10,
                          touchAction: 'none',
                        }}
                        /* 1px Hairline Border: eliminates outer padding that obscured adjacent characters */
                        className={`absolute cursor-move select-none ${
                          !isText || (item.hasBackground ?? true)
                            ? 'bg-white'
                            : 'bg-transparent'
                        } ${
                          isSelected
                            ? 'border border-emerald-500 shadow-sm'
                            : 'border-none'
                        }`}
                        onPointerDown={(e) => handleDragPointerDown(e, item)}
                      >
                        {/* Text Container: Placed at exact 2px offset to match PDF engine output */}
                        {isText && (
                          <div
                            style={{
                              fontFamily: fontFamilyCss,
                              fontSize: `${effectiveFontSize}px`,
                              color: item.color || '#000000',
                              lineHeight: 1.15,
                              whiteSpace: item.fitMode === 'autofit' ? 'nowrap' : 'pre-wrap',
                              wordBreak: 'break-word',
                              paddingLeft: '2px',
                              paddingRight: '2px',
                              fontWeight: item.isBold ? 'bold' : 'normal',
                              fontStyle: item.isItalic ? 'italic' : 'normal',
                              textDecoration: [
                                item.isUnderline ? 'underline' : '',
                                item.isStrikethrough ? 'line-through' : '',
                              ].filter(Boolean).join(' ') || 'none',
                              textAlign: item.textAlign || 'left',
                              justifyContent:
                                item.textAlign === 'center'
                                  ? 'center'
                                  : item.textAlign === 'right'
                                    ? 'flex-end'
                                    : 'flex-start',
                            }}
                            className="w-full h-full flex items-center overflow-hidden select-none"
                          >
                            {item.text || ''}
                          </div>
                        )}

                        {/* 4 Unobstructed Corner Handles */}
                        {isSelected &&
                          CORNER_HANDLES.map((handle) => (
                            <div
                              key={handle.type}
                              style={{ cursor: handle.cursor, touchAction: 'none' }}
                              className={`absolute w-2 h-2 bg-white border border-emerald-500 rounded-full shadow-xs z-30 ${handle.className}`}
                              onPointerDown={(e) => handleResizePointerDown(e, item, handle.type)}
                            />
                          ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              </div>
            </div>


          </div>
        </>
      )}
    </div>
  );
};