import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getLicenseStatus } from '../utils/license';
import {
  useDesktopCapacityRecommendation,
} from '../hooks/useDesktopCapacityRecommendation';
import { DesktopCapacityStatus } from './DesktopCapacityStatus';

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';

import {
  extractUniversalDocumentData,
} from '../utils/pdfEngine';

import {
  clearProcessingRecovery,
  digestText,
  exclusivelyProcess,
  hasRecoverableProcessing,
  localContentId,
} from '../utils/localProcessing';

import {
  saveWorkspaceFiles,
  saveToolWorkspaceState,
  restoreToolWorkspaceState,
  clearToolWorkspace,
  markPdfPreviewNavigation,
  clearPdfPreviewNavigation,
} from '../utils/localWorkspace';

import {
  checkTaskCredit,
  commitTaskCredit,
} from '../utils/taskCreditGate';

import {
  clearUniversalPages,
  readUniversalPage,
  writeUniversalPage,
} from '../utils/universalPageStore';

interface DocumentDataExtractorProps {
  file: File | null;
  onFileChange: (
    file: File | null
  ) => void;
}

type ExtractorSection = {
  pageNumber: number;
  kind: string;
  label: string;
  confidence: number;
  rows: string[][];
};

type ExtractorSession = {
  file: File | null;
  sections: ExtractorSection[];
  error: string | null;
  status: string;
};

const EMPTY_SESSION:
  ExtractorSession = {
  file: null,
  sections: [],
  error: null,
  status: '',
};


const EXTRACTOR_STATE_SCOPE =
  'universal-document-data-extractor';


type PersistedExtractorState = {
  version: 1;

  file: {
    name: string;
    size: number;
    lastModified: number;
  };

  sections: ExtractorSection[];

  error: string | null;

  status: string;
};


const extractorFileKey =
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


const persistedStateMatchesFile =
  (
    state:
      PersistedExtractorState |
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

let extractorSessionCache:
  ExtractorSession = {
  ...EMPTY_SESSION,
};

const escapeCsvCell = (
  value: string
) => {
  const clean =
    value ?? '';

  if (
    clean.includes(',') ||
    clean.includes('"') ||
    clean.includes('\n') ||
    clean.includes('\r')
  ) {
    return `"${clean.replace(
      /"/g,
      '""'
    )}"`;
  }

  return clean;
};

const rowsToCsv = (
  rows: string[][]
) =>
  rows
    .map((row) =>
      row
        .map(escapeCsvCell)
        .join(',')
    )
    .join('\r\n');

const downloadBlob = (
  blob: Blob,
  filename: string
) => {
  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      'a'
    );

  anchor.href = url;
  anchor.download = filename;


  /*
   * iOS Safari may preview CSV/XLSX and recreate the web page
   * when Back is pressed.
   *
   * Reuse the same session-return protection already used for
   * generated PDF previews.
   */
  markPdfPreviewNavigation();


  document.body.appendChild(
    anchor
  );

  anchor.click();
  anchor.remove();


  setTimeout(
    () => {
      /*
       * A normal download never leaves the page.
       * Do not leave a false preview marker behind.
       */
      if (
        document.visibilityState ===
          'visible'
      ) {
        clearPdfPreviewNavigation();
      }
    },
    4000
  );


  setTimeout(
    () =>
      URL.revokeObjectURL(
        url
      ),
    1000
  );
};

const normalizeRows = (
  rows: string[][]
) => {
  const maxColumns =
    Math.max(
      0,
      ...rows.map(
        (row) =>
          row.length
      )
    );

  return rows.map(
    (row) => [
      ...row,
      ...new Array(
        Math.max(
          0,
          maxColumns -
            row.length
        )
      ).fill(''),
    ]
  );
};

const safeSheetName = (
  value: string,
  index: number
) => {
  const clean =
    value
      .replace(
        /[\\/*?:[\]]/g,
        ' '
      )
      .replace(
        /\s+/g,
        ' '
      )
      .trim()
      .slice(0, 27);

  return (
    clean ||
    `Section ${index + 1}`
  );
};

export const DocumentDataExtractor:
  React.FC<
    DocumentDataExtractorProps
  > = ({
    file,
    onFileChange,
  }) => {
    const inputRef =
      useRef<HTMLInputElement | null>(
        null
      );

    /*
     * Prevent handleFile + useEffect from launching the same
     * 150 MB extraction twice inside one JS process.
     */
    const extractionInFlightRef =
      useRef(false);


    const restoredResultFileRef =
      useRef<string | null>(
        null
      );


    const [
      sections,
      setSections,
    ] = useState<
      ExtractorSection[]
    >(
      () =>
        extractorSessionCache.sections
    );

    const [
      isProcessing,
      setIsProcessing,
    ] =
      useState(false);

    const [
      error,
      setError,
    ] =
      useState<string | null>(
        () =>
          extractorSessionCache.error
      );

    const [
      status,
      setStatus,
    ] =
      useState(
        () =>
          extractorSessionCache.status
      );

    const [
      exportingExcel,
      setExportingExcel,
    ] =
      useState(false);

    const {
      recommendation:
        desktopCapacityRecommendation,
    } =
      useDesktopCapacityRecommendation({
        toolId:
          'document-data-extractor',

        selectedBytes:
          file?.size ?? 0,

        enabled:
          Boolean(file) &&
          getLicenseStatus().isPro,
      });

    const totalRows =
      useMemo(
        () =>
          sections.reduce(
            (
              sum,
              section
            ) =>
              sum +
              section.rows.length,
            0
          ),
        [sections]
      );

    useEffect(() => {
      extractorSessionCache = {
        file,
        sections,
        error,
        status,
      };


      if (
        !file ||
        sections.length ===
          0 ||
        restoredResultFileRef.current !==
          extractorFileKey(
            file
          )
      ) {
        return;
      }


      saveToolWorkspaceState<
        PersistedExtractorState
      >(
        EXTRACTOR_STATE_SCOPE,
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

          sections:
            sections.map(
              (
                section
              ) => ({
                ...section,

                rows:
                  section.rows.map(
                    (
                      row
                    ) => [
                      ...row,
                    ]
                  ),
              })
            ),

          error,

          status,
        }
      );
    }, [
      file,
      sections,
      error,
      status,
    ]);

    const clearAll = () => {
      extractorSessionCache = {
        ...EMPTY_SESSION,
      };


      restoredResultFileRef.current =
        null;


      void clearToolWorkspace(
        EXTRACTOR_STATE_SCOPE
      ).catch(
        (
          workspaceError
        ) => {
          console.warn(
            'Unable to clear Universal Extractor session:',
            workspaceError
          );
        }
      );


      void clearUniversalPages()
        .catch(
          (recoveryError) => {
            console.warn(
              'Unable to clear Universal recovery records:',
              recoveryError
            );
          }
        );

      clearProcessingRecovery();

      onFileChange(null);
      setSections([]);
      setError(null);
      setStatus('');

      if (
        inputRef.current
      ) {
        inputRef.current.value =
          '';
      }
    };

    const runExtraction =
      async (
        targetFile: File
      ) => {
        if (
          extractionInFlightRef.current
        ) {
          return;
        }

        const creditCheck =
          checkTaskCredit(
            targetFile
          );

        if (!creditCheck.allowed) {
          setError(
            creditCheck.errorMessage ||
              'This task is not available on your current plan.'
          );
          return;
        }

        extractionInFlightRef.current =
          true;

        setIsProcessing(true);
        setError(null);
        setSections([]);

        try {
          const result =
            await exclusivelyProcess(
              async () => {
                /*
                 * Ensure the 147 MB source survives a Safari
                 * WebContent restart before long OCR begins.
                 */
                await saveWorkspaceFiles(
                  [
                    targetFile,
                  ]
                );

                setStatus(
                  'Preparing local recovery…'
                );

                const sourceIdentity =
                  await localContentId(
                    targetFile
                  );

                const cacheIdentity =
                  await digestText(
                    JSON.stringify(
                      [
                        'universal-data-extractor-v1',
                        sourceIdentity,
                        ',',
                        4,
                        12,
                      ]
                    )
                  );

                setStatus(
                  'Inspecting document structure…'
                );

                return await extractUniversalDocumentData(
                  targetFile,
                  {
                    delimiter: ',',
                    yTolerance: 4,
                    minColumnGap: 12,

                    onProgress: (
                      current,
                      total
                    ) => {
                      setStatus(
                        `Analyzing page ${current} of ${total}…`
                      );
                    },
                  },
                  {
                    readPage:
                      async (
                        pageNumber
                      ) =>
                        await readUniversalPage(
                          cacheIdentity,
                          pageNumber
                        ),

                    writePage:
                      async (
                        pageNumber,
                        pageData
                      ) => {
                        await writeUniversalPage(
                          cacheIdentity,
                          pageNumber,
                          pageData
                        );
                      },
                  }
                );
              }
            );

          let nextSections:
            ExtractorSection[];

          if (
            result.sections?.length
          ) {
            nextSections =
              result.sections.map(
                (section) => ({
                  pageNumber:
                    section.pageNumber,
                  kind:
                    section.kind,
                  label:
                    section.label,
                  confidence:
                    section.confidence,
                  rows:
                    section.rows.map(
                      (row) => [
                        ...row,
                      ]
                    ),
                })
              );
          } else {
            nextSections = [
              {
                pageNumber: 0,
                kind:
                  result.kind,
                label:
                  result.label,
                confidence:
                  result.confidence,
                rows:
                  result.rows.map(
                    (row) => [
                      ...row,
                    ]
                  ),
              },
            ];
          }

          if (
            !nextSections.some(
              (section) =>
                section.rows
                  .length > 0
            )
          ) {
            throw new Error(
              'No usable data could be detected in this document.'
            );
          }

          restoredResultFileRef.current =
            extractorFileKey(
              targetFile
            );


          setSections(
            nextSections
          );

          setStatus(
            `${result.label} detected · ${nextSections.length} ${
              nextSections.length === 1
                ? 'section'
                : 'sections'
            } · ${result.totalRows} rows · ${Math.round(
              result.confidence *
                100
            )}% structure confidence.`
          );

          clearProcessingRecovery();

          commitTaskCredit();
        } catch (
          err: any
        ) {
          console.error(
            'Document extraction error:',
            err
          );

          /*
           * Keep page records + processing recovery marker.
           * A Safari restart/reload can continue from the
           * first unfinished page.
           */
          setError(
            err?.message ||
              'Processing was interrupted. Reopen this tool to continue from the last completed page.'
          );

          setStatus('');
        } finally {
          extractionInFlightRef.current =
            false;

          setIsProcessing(
            false
          );
        }
      };

    const handleFile =
      async (
        nextFile?:
          | File
          | null
      ) => {
        if (!nextFile)
          return;

        const isPdf =
          nextFile.type ===
            'application/pdf' ||
          nextFile.name
            .toLowerCase()
            .endsWith(
              '.pdf'
            );

        if (!isPdf) {
          setError(
            'This version currently accepts PDF documents.'
          );
          return;
        }

        /*
         * A deliberately selected replacement document starts
         * a new final-result session.
         */
        await clearToolWorkspace(
          EXTRACTOR_STATE_SCOPE
        ).catch(
          () => {}
        );


        extractorSessionCache = {
          ...EMPTY_SESSION,
        };


        restoredResultFileRef.current =
          null;


        setSections(
          []
        );

        setError(
          null
        );

        setStatus(
          ''
        );


        onFileChange(
          nextFile
        );
      };

    useEffect(() => {
      if (!file) {
        restoredResultFileRef.current =
          null;

        setSections([]);
        setError(null);
        setStatus('');

        return;
      }


      const key =
        extractorFileKey(
          file
        );


      /*
       * Durable session result:
       *
       * survives:
       * - CSV/Excel preview -> Back
       * - moving to another 1into1 tool and returning
       * - Safari page recreation associated with Preview
       *
       * resetWorkspaceSession() removes it on a genuine refresh.
       */
      const persisted =
        restoreToolWorkspaceState<
          PersistedExtractorState
        >(
          EXTRACTOR_STATE_SCOPE
        );


      if (
        persistedStateMatchesFile(
          persisted,
          file
        ) &&
        persisted &&
        persisted.sections.length >
          0
      ) {
        restoredResultFileRef.current =
          key;


        const restoredSections =
          persisted.sections.map(
            (
              section
            ) => ({
              ...section,

              rows:
                section.rows.map(
                  (
                    row
                  ) => [
                    ...row,
                  ]
                ),
            })
          );


        extractorSessionCache = {
          file,

          sections:
            restoredSections,

          error:
            persisted.error,

          status:
            persisted.status,
        };


        setSections(
          restoredSections
        );

        setError(
          persisted.error
        );

        setStatus(
          persisted.status
        );


        return;
      }


      /*
       * Same-process SPA navigation is even cheaper: reuse the
       * existing module cache without touching storage.
       */
      if (
        extractorSessionCache.file &&
        extractorFileKey(
          extractorSessionCache.file
        ) ===
          key &&
        extractorSessionCache
          .sections.length >
          0
      ) {
        restoredResultFileRef.current =
          key;


        setSections(
          extractorSessionCache.sections
        );

        setError(
          extractorSessionCache.error
        );

        setStatus(
          extractorSessionCache.status
        );


        return;
      }


      restoredResultFileRef.current =
        null;


      setSections([]);
      setError(null);
      setStatus('');


      /*
       * Only resume extraction when there is genuinely an
       * interrupted processing job. A completed final result
       * never reaches this branch.
       */
      if (
        hasRecoverableProcessing()
      ) {
        void runExtraction(
          file
        );
      }
    }, [file]);

    const updateCell = (
      sectionIndex: number,
      rowIndex: number,
      columnIndex: number,
      value: string
    ) => {
      setSections(
        (current) => {
          const next =
            current.map(
              (section) => ({
                ...section,
                rows:
                  section.rows.map(
                    (row) => [
                      ...row,
                    ]
                  ),
              })
            );

          const row =
            next[
              sectionIndex
            ].rows[rowIndex];

          while (
            row.length <=
            columnIndex
          ) {
            row.push('');
          }

          row[
            columnIndex
          ] = value;

          return next;
        }
      );
    };

    const deleteRow = (
      sectionIndex: number,
      rowIndex: number
    ) => {
      setSections(
        (current) =>
          current.map(
            (
              section,
              index
            ) =>
              index ===
              sectionIndex
                ? {
                    ...section,
                    rows:
                      section.rows.filter(
                        (
                          _,
                          i
                        ) =>
                          i !==
                          rowIndex
                      ),
                  }
                : section
          )
      );
    };

    const resetExtraction =
      () => {
        if (
          !file ||
          isProcessing
        ) {
          return;
        }

        void runExtraction(
          file
        );
      };

    const downloadCsv =
      () => {
        if (
          !sections.length ||
          !file
        ) {
          return;
        }

        const base =
          file.name.replace(
            /\.[^/.]+$/,
            ''
          );

        let csvRows:
          string[][] = [];

        if (
          sections.length ===
          1
        ) {
          csvRows =
            normalizeRows(
              sections[0].rows
            );
        } else {
          for (
            const section of
            sections
          ) {
            csvRows.push([
              section.label,
            ]);

            csvRows.push(
              ...normalizeRows(
                section.rows
              )
            );

            csvRows.push([]);
          }
        }

        const csv =
          rowsToCsv(
            csvRows
          );

        downloadBlob(
          new Blob(
            [
              '\uFEFF',
              csv,
            ],
            {
              type:
                'text/csv;charset=utf-8',
            }
          ),
          `${base}-extracted.csv`
        );
      };

    const downloadExcel =
      async () => {
        if (
          !sections.length ||
          !file
        ) {
          return;
        }

        setExportingExcel(
          true
        );
        setError(null);

        try {
          setStatus(
            'Creating Excel workbook locally…'
          );

          const ExcelJS =
            await import(
              'exceljs'
            );

          const workbook =
            new ExcelJS.Workbook();

          workbook.creator =
            '1into1';

          workbook.created =
            new Date();

          const usedNames =
            new Set<string>();

          sections.forEach(
            (
              section,
              sectionIndex
            ) => {
              let name =
                sections.length ===
                1
                  ? 'Extracted Data'
                  : safeSheetName(
                      section.label,
                      sectionIndex
                    );

              let suffix = 2;
              const original =
                name;

              while (
                usedNames.has(
                  name
                )
              ) {
                name =
                  `${original.slice(
                    0,
                    24
                  )} ${suffix}`.slice(
                    0,
                    31
                  );

                suffix++;
              }

              usedNames.add(
                name
              );

              const worksheet =
                workbook.addWorksheet(
                  name
                );

              const normalized =
                normalizeRows(
                  section.rows
                );

              normalized.forEach(
                (row) =>
                  worksheet.addRow(
                    row
                  )
              );

              if (
                worksheet.rowCount >
                  0 &&
                section.kind !==
                  'general'
              ) {
                worksheet.getRow(
                  1
                ).font = {
                  bold: true,
                };

                worksheet.views =
                  [
                    {
                      state:
                        'frozen',
                      ySplit: 1,
                    },
                  ];
              }

              const columnCount =
                Math.max(
                  0,
                  ...normalized.map(
                    (row) =>
                      row.length
                  )
                );

              for (
                let columnIndex =
                  1;
                columnIndex <=
                columnCount;
                columnIndex++
              ) {
                const column =
                  worksheet.getColumn(
                    columnIndex
                  );

                let longest =
                  10;

                column.eachCell(
                  {
                    includeEmpty:
                      true,
                  },
                  (cell) => {
                    const length =
                      String(
                        cell.value ??
                          ''
                      ).length;

                    longest =
                      Math.max(
                        longest,
                        Math.min(
                          length,
                          columnIndex ===
                            1 &&
                            section.kind ===
                              'general'
                            ? 90
                            : 55
                        )
                      );
                  }
                );

                column.width =
                  longest + 2;
              }
            }
          );

          const buffer =
            await workbook.xlsx.writeBuffer();

          const base =
            file.name.replace(
              /\.[^/.]+$/,
              ''
            );

          downloadBlob(
            new Blob(
              [buffer],
              {
                type:
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              }
            ),
            `${base}-extracted.xlsx`
          );

          setStatus(
            `Excel created locally with ${sections.length} ${
              sections.length ===
              1
                ? 'sheet'
                : 'sheets'
            }.`
          );
        } catch (
          err: any
        ) {
          console.error(
            'Excel export error:',
            err
          );

          setError(
            err?.message ||
              'Unable to create the Excel workbook.'
          );
        } finally {
          setExportingExcel(
            false
          );
        }
      };

    return (
      <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-5 text-black">
        <div className="rounded-2xl border border-zinc-300 bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                Local Data Extraction
              </div>

              <h2 className="text-xl sm:text-2xl font-semibold mt-2 tracking-tight">
                Universal Document Data Extractor
              </h2>

              <p className="text-sm text-zinc-700 mt-2 max-w-3xl leading-6">
                Automatically distinguish tables, forms, bank statements and document text page-by-page, then review and export the extracted data.
              </p>
            </div>

            {file && (
              <button
                type="button"
                onClick={
                  clearAll
                }
                disabled={
                  isProcessing
                }
                className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl border border-zinc-300 bg-white text-black text-sm font-semibold hover:bg-zinc-100 disabled:opacity-50 transition"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>

          {!file ? (
            <button
              type="button"
              onClick={() =>
                inputRef.current?.click()
              }
              onDragOver={(
                event
              ) =>
                event.preventDefault()
              }
              onDrop={(
                event
              ) => {
                event.preventDefault();

                void handleFile(
                  event
                    .dataTransfer
                    .files?.[0]
                );
              }}
              className="mt-6 w-full min-h-[220px] rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 hover:bg-emerald-50/40 hover:border-emerald-500 transition flex flex-col items-center justify-center text-center p-8"
            >
              <Upload className="w-9 h-9 text-emerald-700" />

              <strong className="mt-4 text-base">
                Drop a document here
              </strong>

              <span className="mt-2 text-sm text-zinc-600">
                or click to choose a PDF
              </span>

              <span className="mt-4 text-xs text-zinc-500">
                Digital PDFs + scanned PDFs · page-aware OCR · local processing
              </span>

              <span
                className="mt-2 max-w-xl text-xs leading-5 text-zinc-500"
                style={{
                  color: '#71717a',
                }}
              >
                For best extraction accuracy, use a clear, high-resolution document. Heavily compressed, blurry, or low-resolution scans may reduce OCR accuracy.
              </span>
            </button>
          ) : (
            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex items-center gap-3 text-white">
              <FileText className="w-5 h-5 text-emerald-400 shrink-0" />

              <div className="min-w-0 flex-1">
                <strong className="block text-sm truncate">
                  {
                    file.name
                  }
                </strong>

                <span className="text-xs text-zinc-400">
                  {(
                    file.size /
                    1024 /
                    1024
                  ).toFixed(
                    2
                  )}{' '}
                  MB
                </span>
              </div>

              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
              ) : sections.length >
                0 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : null}
            </div>
          )}

          {desktopCapacityRecommendation && (
            <div className="mt-4">
              <DesktopCapacityStatus
                recommendation={
                  desktopCapacityRecommendation
                }
              />
            </div>
          )}

          <input
            ref={
              inputRef
            }
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(
              event
            ) => {
              void handleFile(
                event.target
                  .files?.[0]
              );

              event.target.value =
                '';
            }}
          />

          {status && (
            <div className="mt-4 flex items-center gap-2 text-xs text-zinc-700">
              {isProcessing ||
              exportingExcel ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              )}

              {status}
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {file &&
            !isProcessing &&
            sections.length === 0 && (
              <button
                type="button"
                onClick={() =>
                  void runExtraction(
                    file
                  )
                }
                className="mt-4 w-full min-h-12 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Extract Data
              </button>
            )}
        </div>

        {sections.length >
          0 &&
          !isProcessing && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-300 bg-white p-5 sm:p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      Preview extracted data
                    </h3>

                    <p className="text-xs text-zinc-600 mt-1">
                      {
                        totalRows
                      }{' '}
                      rows ·{' '}
                      {
                        sections.length
                      }{' '}
                      {sections.length ===
                      1
                        ? 'section'
                        : 'sections'}{' '}
                      · Click any cell to correct it.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={
                      resetExtraction
                    }
                    className="inline-flex items-center justify-center gap-2 min-h-10 px-3 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 text-xs font-semibold"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Re-extract
                  </button>
                </div>
              </div>

              {sections.map(
                (
                  section,
                  sectionIndex
                ) => {
                  const rows =
                    normalizeRows(
                      section.rows
                    );

                  const columnCount =
                    Math.max(
                      0,
                      ...rows.map(
                        (row) =>
                          row.length
                      )
                    );

                  return (
                    <div
                      key={`${section.label}-${sectionIndex}`}
                      className="rounded-2xl border border-zinc-300 bg-white p-4 sm:p-5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <strong className="text-sm">
                          {
                            section.label
                          }
                        </strong>

                        <span
                          className="text-xs rounded-full border border-zinc-300 px-2.5 py-1"
                          style={{
                            backgroundColor: '#f4f4f5',
                            color: '#52525b',
                          }}
                        >
                          {Math.round(
                            section.confidence *
                              100
                          )}
                          % confidence
                        </span>
                      </div>

                      <div className="overflow-auto max-h-[520px] rounded-xl border border-zinc-300">
                        <table className="min-w-full border-collapse text-xs">
                          <tbody>
                            {rows.map(
                              (
                                row,
                                rowIndex
                              ) => {
                                const header =
                                  rowIndex ===
                                    0 &&
                                  section.kind !==
                                    'general';

                                return (
                                  <tr
                                    key={
                                      rowIndex
                                    }
                                    style={{
                                      backgroundColor:
                                        header
                                          ? '#f4f4f5'
                                          : '#ffffff',
                                      color:
                                        '#000000',
                                    }}
                                  >
                                    <td
                                      className="sticky left-0 z-10 w-10 min-w-10 border-r border-b border-zinc-300 text-center font-medium"
                                      style={{
                                        backgroundColor:
                                          '#f4f4f5',
                                        color:
                                          '#52525b',
                                      }}
                                    >
                                      {rowIndex +
                                        1}
                                    </td>

                                    {row.map(
                                      (
                                        cell,
                                        columnIndex
                                      ) => {
                                        const wide =
                                          section.kind ===
                                            'general' ||
                                          (columnCount ===
                                            6 &&
                                            columnIndex ===
                                              2);

                                        return (
                                          <td
                                            key={
                                              columnIndex
                                            }
                                            className={`border-r border-b border-zinc-200 p-0 ${
                                              wide
                                                ? 'min-w-[360px]'
                                                : 'min-w-[150px]'
                                            }`}
                                            style={{
                                              backgroundColor:
                                                header
                                                  ? '#f4f4f5'
                                                  : '#ffffff',
                                              color:
                                                '#000000',
                                            }}
                                          >
                                            <input
                                              value={
                                                cell
                                              }
                                              onChange={(
                                                event
                                              ) =>
                                                updateCell(
                                                  sectionIndex,
                                                  rowIndex,
                                                  columnIndex,
                                                  event
                                                    .target
                                                    .value
                                                )
                                              }
                                              style={{
                                                backgroundColor:
                                                  header
                                                    ? '#f4f4f5'
                                                    : '#ffffff',
                                                color:
                                                  '#000000',
                                              }}
                                              className={`w-full px-3 py-2.5 outline-none focus:bg-emerald-50 focus:ring-1 focus:ring-inset focus:ring-emerald-500 ${
                                                wide
                                                  ? 'min-w-[360px]'
                                                  : 'min-w-[150px]'
                                              } ${
                                                header
                                                  ? 'font-semibold'
                                                  : ''
                                              }`}
                                            />
                                          </td>
                                        );
                                      }
                                    )}

                                    <td
                                      className="border-b border-zinc-200 px-2"
                                      style={{
                                        backgroundColor:
                                          '#ffffff',
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() =>
                                          deleteRow(
                                            sectionIndex,
                                            rowIndex
                                          )
                                        }
                                        className="p-2 rounded-lg text-zinc-500 hover:text-red-700 hover:bg-red-50 transition"
                                        title="Delete row"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              }
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                }
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={
                    downloadCsv
                  }
                  className="min-h-12 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 px-5 flex items-center justify-center gap-2 text-sm font-semibold transition"
                >
                  <Download className="w-4 h-4" />
                  Download CSV (.csv)
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void downloadExcel()
                  }
                  disabled={
                    exportingExcel
                  }
                  className="min-h-12 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 px-5 flex items-center justify-center gap-2 text-sm font-semibold transition"
                >
                  {exportingExcel ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4" />
                  )}

                  Download Excel (.xlsx)
                </button>
              </div>
            </div>
          )}

        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <ShieldCheck className="w-4 h-4 text-emerald-700 mb-2" />
            <strong className="block">
              Private processing
            </strong>
            <span className="block mt-1 text-zinc-600 leading-5">
              Extraction happens locally in your browser.
            </span>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <FileText className="w-4 h-4 text-emerald-700 mb-2" />
            <strong className="block">
              Page-aware OCR
            </strong>
            <span className="block mt-1 text-zinc-600 leading-5">
              Each scanned page is classified separately as a table, form or document text.
            </span>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700 mb-2" />
            <strong className="block">
              Multi-sheet Excel
            </strong>
            <span className="block mt-1 text-zinc-600 leading-5">
              Mixed documents export into separate logical Excel sheets.
            </span>
          </div>
        </div>
      </div>
    );
  };

export default DocumentDataExtractor;
