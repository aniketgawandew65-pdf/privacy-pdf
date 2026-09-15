/*
 * 1into1 local workspace
 *
 * Purpose:
 * - Keep user-selected files available when the browser temporarily
 *   leaves the app for a PDF preview and the user presses Back.
 * - Keep file bytes on the user's own device.
 * - Use OPFS (Origin Private File System) so large files do not need
 *   to be converted to base64 or stored in localStorage.
 *
 * Important:
 * - A normal/hard refresh will be handled by App.tsx later and will
 *   clear the workspace.
 * - Clear/Delete will also remove stored files once wired in.
 * - No document bytes are sent to a server.
 */

const SESSION_KEY = "oneinto1_workspace_session";
const MANIFEST_KEY = "oneinto1_workspace_manifest";

export type WorkspaceFileMeta = {
  storedName: string;
  originalName: string;
  type: string;
  lastModified: number;
  size: number;
};

type WorkspaceManifest = {
  sessionId: string;
  files: WorkspaceFileMeta[];
};

const hasOpfs = () =>
  typeof navigator !== "undefined" &&
  !!navigator.storage &&
  typeof navigator.storage.getDirectory === "function";

const makeSessionId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2)
  );
};

const getOrCreateSessionId = () => {
  let sessionId =
    sessionStorage.getItem(SESSION_KEY);

  if (!sessionId) {
    sessionId = makeSessionId();
    sessionStorage.setItem(
      SESSION_KEY,
      sessionId
    );
  }

  return sessionId;
};

const readManifest = (): WorkspaceManifest | null => {
  try {
    const raw =
      sessionStorage.getItem(MANIFEST_KEY);

    if (!raw) return null;

    const parsed =
      JSON.parse(raw) as WorkspaceManifest;

    if (
      !parsed ||
      typeof parsed.sessionId !== "string" ||
      !Array.isArray(parsed.files)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const writeManifest = (
  manifest: WorkspaceManifest
) => {
  sessionStorage.setItem(
    MANIFEST_KEY,
    JSON.stringify(manifest)
  );
};

const manifestMatchesFiles = (
  manifest: WorkspaceManifest | null,
  files: File[]
) => {
  if (
    !manifest ||
    manifest.files.length !==
      files.length
  ) {
    return false;
  }

  return manifest.files.every(
    (
      meta,
      index
    ) => {
      const file =
        files[index];

      if (!file) {
        return false;
      }

      return (
        meta.originalName ===
          file.name &&
        meta.size ===
          file.size &&
        meta.type ===
          (
            file.type ||
            "application/octet-stream"
          ) &&
        meta.lastModified ===
          (
            file.lastModified ||
            meta.lastModified
          )
      );
    }
  );
};

const getWorkspaceDirectory = async (
  create = true
) => {
  if (!hasOpfs()) return null;

  const root =
    await navigator.storage.getDirectory();

  const sessionId =
    getOrCreateSessionId();

  try {
    return await root.getDirectoryHandle(
      `workspace-${sessionId}`,
      { create }
    );
  } catch {
    return null;
  }
};

let workspaceSaveQueue:
  Promise<void> =
    Promise.resolve();

/*
 * Refresh/reset must not race an OPFS save or clear.
 *
 * Normal workspace operations wait for this barrier whenever
 * a complete session reset is already in progress.
 */
let workspaceResetPromise:
  Promise<void> | null =
    null;

const saveWorkspaceFilesUnserialized = async (
  files: File[]
): Promise<boolean> => {
  if (files.length === 0) {
    await clearWorkspaceFilesUnserialized();
    return true;
  }

  const existingManifest =
    readManifest();

  const existingSessionId =
    sessionStorage.getItem(
      SESSION_KEY
    );

  if (
    existingManifest &&
    existingSessionId &&
    existingManifest.sessionId ===
      existingSessionId &&
    manifestMatchesFiles(
      existingManifest,
      files
    )
  ) {
    return true;
  }

  const directory =
    await getWorkspaceDirectory(true);

  if (!directory) {
    return false;
  }

  const sessionId =
    getOrCreateSessionId();

  /*
   * Snapshot existing entries, but DO NOT delete them yet.
   *
   * The previous workspace must remain recoverable until
   * every replacement file has finished writing.
   */
  const previousStoredNames:
    string[] = [];

  try {
    for await (
      const name of directory.keys()
    ) {
      previousStoredNames.push(
        name
      );
    }
  } catch {
    /*
     * Directory iteration is optional in some browsers.
     * Saving can still continue; stale-entry cleanup will
     * simply be skipped for this pass.
     */
  }

  const manifestFiles:
    WorkspaceFileMeta[] = [];

  /*
   * Track names before writing begins so even a file that
   * fails halfway through its first OPFS write can be
   * removed safely.
   */
  const createdStoredNames:
    string[] = [];

  try {
    for (
      let index = 0;
      index < files.length;
      index++
    ) {
      const file = files[index];

      const storedName =
        `file-${index}-${Date.now()}`;

      createdStoredNames.push(
        storedName
      );

      const handle =
        await directory.getFileHandle(
          storedName,
          { create: true }
        );

      const writable =
        await handle.createWritable();

      /*
       * File/Blob is written directly to the browser's
       * private origin storage.
       *
       * We deliberately do not call arrayBuffer(),
       * base64 encode it, or duplicate it in JavaScript.
       */
      await writable.write(file);
      await writable.close();

      manifestFiles.push({
        storedName,
        originalName: file.name,
        type:
          file.type ||
          "application/octet-stream",
        lastModified:
          file.lastModified ||
          Date.now(),
        size: file.size,
      });
    }

    /*
     * Switch restoration to the new files only after every
     * write has completed successfully.
     */
    writeManifest({
      sessionId,
      files: manifestFiles,
    });

    /*
     * The new manifest is now authoritative.
     * Old/stale OPFS entries can be removed safely.
     */
    const keepNames =
      new Set(
        manifestFiles.map(
          (meta) =>
            meta.storedName
        )
      );

    for (
      const name of
      previousStoredNames
    ) {
      if (
        keepNames.has(
          name
        )
      ) {
        continue;
      }

      try {
        await directory.removeEntry(
          name
        );
      } catch {
        // A stale entry is harmless; manifest controls restore.
      }
    }

    return true;
  } catch (error) {
    /*
     * A replacement failed before the manifest switched.
     * Remove only files created by this failed attempt.
     * The previous manifest and previous OPFS files remain.
     */
    for (
      const name of
      createdStoredNames
    ) {
      try {
        await directory.removeEntry(
          name
        );
      } catch {
        // Partial file may not exist or may already be gone.
      }
    }

    console.warn(
      "Local workspace persistence unavailable:",
      error
    );

    return false;
  }
};

export const saveWorkspaceFiles = async (
  files: File[]
): Promise<boolean> => {
  /*
   * A full refresh/reset owns all workspace storage while it
   * is running. Do not start a new save until it has finished.
   */
  while (workspaceResetPromise) {
    await workspaceResetPromise;
  }

  /*
   * Serialize OPFS writes.
   *
   * React state can change several times quickly,
   * especially during restore, reorder and multi-file
   * selection. Never allow two workspace rewrites to
   * delete/write the same directory simultaneously.
   */
  const run =
    workspaceSaveQueue.then(
      () =>
        saveWorkspaceFilesUnserialized(
          files
        )
    );

  /*
   * Keep the queue alive even when one save fails.
   * The caller still receives the original rejection/result,
   * but future saves are not permanently blocked.
   */
  workspaceSaveQueue =
    run.then(
      () => undefined,
      () => undefined
    );

  return await run;
};



export const restoreWorkspaceFiles =
  async (): Promise<File[]> => {
    const manifest =
      readManifest();

    if (
      !manifest ||
      manifest.files.length === 0
    ) {
      return [];
    }

    const currentSessionId =
      sessionStorage.getItem(
        SESSION_KEY
      );

    if (
      !currentSessionId ||
      currentSessionId !==
        manifest.sessionId
    ) {
      return [];
    }

    const directory =
      await getWorkspaceDirectory(false);

    if (!directory) {
      return [];
    }

    const restored: File[] = [];

    try {
      for (
        const meta of
        manifest.files
      ) {
        const handle =
          await directory.getFileHandle(
            meta.storedName
          );

        const storedFile =
          await handle.getFile();

        /*
         * Re-create the original user-facing filename/type
         * while the underlying bytes remain browser-local.
         */
        restored.push(
          new File(
            [storedFile],
            meta.originalName,
            {
              type: meta.type,
              lastModified:
                meta.lastModified,
            }
          )
        );
      }

      return restored;
    } catch (error) {
      console.warn(
        "Unable to restore local workspace:",
        error
      );

      return [];
    }
  };

const clearWorkspaceFilesUnserialized =
  async (): Promise<void> => {
    const sessionId =
      sessionStorage.getItem(
        SESSION_KEY
      );

    sessionStorage.removeItem(
      MANIFEST_KEY
    );

    if (!sessionId || !hasOpfs()) {
      return;
    }

    try {
      const root =
        await navigator.storage.getDirectory();

      await root.removeEntry(
        `workspace-${sessionId}`,
        {
          recursive: true,
        }
      );
    } catch {
      // Missing directory is equivalent to already cleared.
    }
  };

export const clearWorkspaceFiles =
  async (): Promise<void> => {
    /*
     * An explicit Clear is itself a workspace mutation.
     * Queue it behind any pending save so a half-written
     * workspace cannot be deleted underneath the writer.
     */
    while (workspaceResetPromise) {
      await workspaceResetPromise;
    }

    const run =
      workspaceSaveQueue.then(
        () =>
          clearWorkspaceFilesUnserialized()
      );

    workspaceSaveQueue =
      run.then(
        () => undefined,
        () => undefined
      );

    await run;
  };


export const resetWorkspaceSession =
  async (): Promise<void> => {
    /*
     * A second caller joins the reset already in progress.
     */
    if (workspaceResetPromise) {
      await workspaceResetPromise;
      return;
    }

    const sessionId =
      sessionStorage.getItem(
        SESSION_KEY
      );

    const run =
      (async () => {
        /*
         * First allow every mutation that started before the
         * reset to finish.
         *
         * Once workspaceResetPromise is installed below,
         * newly-started saves/clears will wait for us instead.
         */
        await workspaceSaveQueue;

        const pendingToolMutations =
          Array.from(
            toolSaveQueues.values()
          );

        if (
          pendingToolMutations.length >
          0
        ) {
          await Promise.allSettled(
            pendingToolMutations
          );
        }

        /*
         * Use the raw clear primitive here. Calling the public
         * queued clear would make reset wait on itself.
         */
        await clearWorkspaceFilesUnserialized();

        /*
         * Clear tool-scoped manifests/state as well.
         */
        const keysToRemove:
          string[] = [];

        for (
          let index = 0;
          index < sessionStorage.length;
          index++
        ) {
          const key =
            sessionStorage.key(
              index
            );

          if (
            key &&
            (
              key.startsWith(
                "oneinto1_tool_manifest:"
              ) ||
              key.startsWith(
                "oneinto1_tool_state:"
              )
            )
          ) {
            keysToRemove.push(
              key
            );
          }
        }

        for (
          const key of
          keysToRemove
        ) {
          sessionStorage.removeItem(
            key
          );
        }

        /*
         * All per-tool saves that existed before reset have
         * settled. Their OPFS directories can now be removed
         * without racing their writers.
         */
        if (
          sessionId &&
          hasOpfs()
        ) {
          try {
            const root =
              await navigator.storage.getDirectory();

            for await (
              const name of
              root.keys()
            ) {
              if (
                name.startsWith(
                  `tool-workspace-${sessionId}-`
                )
              ) {
                await root.removeEntry(
                  name,
                  {
                    recursive: true,
                  }
                );
              }
            }
          } catch {
            // Already removed / unsupported.
          }
        }

        sessionStorage.removeItem(
          SESSION_KEY
        );
      })();

    /*
     * Install the barrier before the async reset continues.
     * New saves/clears now wait for this exact operation.
     */
    workspaceResetPromise =
      run;

    try {
      await run;
    } finally {
      if (
        workspaceResetPromise ===
        run
      ) {
        workspaceResetPromise =
          null;
      }
    }
  };


export const isPageReload = () => {
  try {
    const navigation =
      performance.getEntriesByType(
        "navigation"
      )[0] as PerformanceNavigationTiming | undefined;

    return navigation?.type === "reload";
  } catch {
    return false;
  }
};

/*
 * ============================================================
 * PDF PREVIEW -> BACK PROTECTION
 * ============================================================
 *
 * iOS Safari can open a generated PDF in native/browser preview
 * and recreate this page when the user presses Back.
 *
 * That recreation can be reported as "reload".
 */

const PDF_PREVIEW_RETURN_KEY =
  "oneinto1_pdf_preview_return";

const PDF_PREVIEW_MAX_AGE_MS =
  30 * 60 * 1000;

export const markPdfPreviewNavigation =
  () => {
    try {
      sessionStorage.setItem(
        PDF_PREVIEW_RETURN_KEY,
        String(Date.now())
      );
    } catch {
      // Download must continue even if storage is unavailable.
    }
  };

export const clearPdfPreviewNavigation =
  () => {
    try {
      sessionStorage.removeItem(
        PDF_PREVIEW_RETURN_KEY
      );
    } catch {
      // Ignore unavailable sessionStorage.
    }
  };

export const consumePdfPreviewNavigation =
  () => {
    try {
      const raw =
        sessionStorage.getItem(
          PDF_PREVIEW_RETURN_KEY
        );

      if (!raw) {
        return false;
      }

      sessionStorage.removeItem(
        PDF_PREVIEW_RETURN_KEY
      );

      const timestamp =
        Number(raw);

      if (
        !Number.isFinite(timestamp)
      ) {
        return false;
      }

      const age =
        Date.now() -
        timestamp;

      return (
        age >= 0 &&
        age <= PDF_PREVIEW_MAX_AGE_MS
      );
    } catch {
      return false;
    }
  };

/*
 * ============================================================
 * TOOL-SCOPED WORKSPACES
 * ============================================================
 *
 * Some 1into1 tools own their input internally instead of using
 * App.tsx sharedFiles (Compare, Scan, Image Converter, etc.).
 *
 * These helpers give those tools isolated browser-local storage
 * while keeping the same session lifetime:
 *
 * - survives preview -> Back
 * - survives normal in-app navigation
 * - cleared by explicit tool Clear/Delete
 * - cleared by browser refresh through resetWorkspaceSession()
 */

const TOOL_MANIFEST_PREFIX =
  "oneinto1_tool_manifest:";

const TOOL_STATE_PREFIX =
  "oneinto1_tool_state:";

const safeToolScope = (
  scope: string
) =>
  scope
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") ||
  "tool";

const getToolDirectory = async (
  scope: string,
  create = true
) => {
  if (!hasOpfs()) return null;

  const root =
    await navigator.storage.getDirectory();

  const sessionId =
    getOrCreateSessionId();

  const safeScope =
    safeToolScope(scope);

  try {
    return await root.getDirectoryHandle(
      `tool-workspace-${sessionId}-${safeScope}`,
      { create }
    );
  } catch {
    return null;
  }
};

const toolSaveQueues =
  new Map<
    string,
    Promise<void>
  >();

const saveToolWorkspaceFilesUnserialized =
  async (
    scope: string,
    files: File[]
  ): Promise<boolean> => {
    if (files.length === 0) {
      await clearToolWorkspaceUnserialized(
        scope
      );
      return true;
    }

    const manifestKey =
      TOOL_MANIFEST_PREFIX +
      safeToolScope(scope);

    try {
      const rawManifest =
        sessionStorage.getItem(
          manifestKey
        );

      if (rawManifest) {
        const existingManifest =
          JSON.parse(
            rawManifest
          ) as WorkspaceManifest;

        const existingSessionId =
          sessionStorage.getItem(
            SESSION_KEY
          );

        if (
          existingSessionId &&
          existingManifest.sessionId ===
            existingSessionId &&
          manifestMatchesFiles(
            existingManifest,
            files
          )
        ) {
          return true;
        }
      }
    } catch {
      // Invalid/stale manifest falls through to a normal save.
    }

    const directory =
      await getToolDirectory(
        scope,
        true
      );

    if (!directory) {
      return false;
    }

    /*
     * Keep the previous tool workspace intact until every
     * replacement file has been written successfully.
     */
    const previousStoredNames:
      string[] = [];

    try {
      for await (
        const name of directory.keys()
      ) {
        previousStoredNames.push(
          name
        );
      }
    } catch {
      /*
       * Directory iteration is optional in some browsers.
       * Manifest-based restoration still works.
       */
    }

    const sessionId =
      getOrCreateSessionId();

    const manifestFiles:
      WorkspaceFileMeta[] = [];

    /*
     * Track names immediately, not only after a successful
     * write, so a partially-created OPFS file can also be
     * removed if the save fails midway.
     */
    const createdStoredNames:
      string[] = [];

    try {
      for (
        let index = 0;
        index < files.length;
        index++
      ) {
        const file =
          files[index];

        const storedName =
          `file-${index}-${Date.now()}`;

        createdStoredNames.push(
          storedName
        );

        const handle =
          await directory.getFileHandle(
            storedName,
            { create: true }
          );

        const writable =
          await handle.createWritable();

        await writable.write(file);
        await writable.close();

        manifestFiles.push({
          storedName,
          originalName: file.name,
          type:
            file.type ||
            "application/octet-stream",
          lastModified:
            file.lastModified ||
            Date.now(),
          size: file.size,
        });
      }

      const manifest: WorkspaceManifest = {
        sessionId,
        files: manifestFiles,
      };

      /*
       * Only switch restoration to the new workspace after
       * all replacement files are safely stored.
       */
      sessionStorage.setItem(
        manifestKey,
        JSON.stringify(manifest)
      );

      /*
       * The new manifest is authoritative now.
       * Old files can be removed without risking restore.
       */
      const keepNames =
        new Set(
          manifestFiles.map(
            (meta) =>
              meta.storedName
          )
        );

      for (
        const name of
        previousStoredNames
      ) {
        if (
          keepNames.has(
            name
          )
        ) {
          continue;
        }

        try {
          await directory.removeEntry(
            name,
            {
              recursive: true,
            }
          );
        } catch {
          // Stale OPFS entry is harmless; manifest controls restore.
        }
      }

      return true;
    } catch (error) {
      /*
       * The old manifest has not been replaced.
       * Delete only files created by this failed attempt.
       */
      for (
        const name of
        createdStoredNames
      ) {
        try {
          await directory.removeEntry(
            name,
            {
              recursive: true,
            }
          );
        } catch {
          // Partial entry may already be absent.
        }
      }

      console.warn(
        `Unable to persist ${scope} workspace:`,
        error
      );

      return false;
    }
  };

export const saveToolWorkspaceFiles =
  async (
    scope: string,
    files: File[]
  ): Promise<boolean> => {
    /*
     * Do not recreate a tool workspace while a refresh/reset
     * is deleting the current session.
     */
    while (workspaceResetPromise) {
      await workspaceResetPromise;
    }

    const queueKey =
      safeToolScope(
        scope
      );

    const previous =
      toolSaveQueues.get(
        queueKey
      ) ??
      Promise.resolve();

    /*
     * One write at a time for this tool workspace.
     *
     * Different tool scopes do not block each other,
     * while repeated saves inside the same tool cannot
     * race against its delete/write cycle.
     */
    const run =
      previous.then(
        () =>
          saveToolWorkspaceFilesUnserialized(
            scope,
            files
          )
      );

    const settled =
      run.then(
        () => undefined,
        () => undefined
      );

    toolSaveQueues.set(
      queueKey,
      settled
    );

    try {
      return await run;
    } finally {
      /*
       * Only remove this queue entry if a newer save
       * has not already chained itself behind us.
       */
      if (
        toolSaveQueues.get(
          queueKey
        ) === settled
      ) {
        toolSaveQueues.delete(
          queueKey
        );
      }
    }
  };



export const restoreToolWorkspaceFiles =
  async (
    scope: string
  ): Promise<File[]> => {
    if (isPageReload()) {
      return [];
    }
    const key =
      TOOL_MANIFEST_PREFIX +
      safeToolScope(scope);

    try {
      const raw =
        sessionStorage.getItem(key);

      if (!raw) return [];

      const manifest =
        JSON.parse(
          raw
        ) as WorkspaceManifest;

      const currentSessionId =
        sessionStorage.getItem(
          SESSION_KEY
        );

      if (
        !currentSessionId ||
        manifest.sessionId !==
          currentSessionId ||
        !Array.isArray(
          manifest.files
        )
      ) {
        return [];
      }

      const directory =
        await getToolDirectory(
          scope,
          false
        );

      if (!directory) {
        return [];
      }

      const restored: File[] = [];

      for (
        const meta of
        manifest.files
      ) {
        const handle =
          await directory.getFileHandle(
            meta.storedName
          );

        const storedFile =
          await handle.getFile();

        restored.push(
          new File(
            [storedFile],
            meta.originalName,
            {
              type: meta.type,
              lastModified:
                meta.lastModified,
            }
          )
        );
      }

      return restored;
    } catch (error) {
      console.warn(
        `Unable to restore ${scope} workspace:`,
        error
      );

      return [];
    }
  };

export const saveToolWorkspaceState =
  <T>(
    scope: string,
    state: T
  ) => {
    try {
      sessionStorage.setItem(
        TOOL_STATE_PREFIX +
          safeToolScope(scope),
        JSON.stringify(state)
      );
    } catch (error) {
      console.warn(
        `Unable to save ${scope} state:`,
        error
      );
    }
  };

export const restoreToolWorkspaceState =
  <T>(
    scope: string
  ): T | null => {
    if (isPageReload()) {
      return null;
    }

    try {
      const raw =
        sessionStorage.getItem(
          TOOL_STATE_PREFIX +
            safeToolScope(scope)
        );

      if (!raw) return null;

      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

const clearToolWorkspaceUnserialized =
  async (
    scope: string
  ): Promise<void> => {
    const safeScope =
      safeToolScope(scope);

    sessionStorage.removeItem(
      TOOL_MANIFEST_PREFIX +
        safeScope
    );

    sessionStorage.removeItem(
      TOOL_STATE_PREFIX +
        safeScope
    );

    const sessionId =
      sessionStorage.getItem(
        SESSION_KEY
      );

    if (
      !sessionId ||
      !hasOpfs()
    ) {
      return;
    }

    try {
      const root =
        await navigator.storage.getDirectory();

      await root.removeEntry(
        `tool-workspace-${sessionId}-${safeScope}`,
        {
          recursive: true,
        }
      );
    } catch {
      // Already cleared / unavailable.
    }
  };

export const clearToolWorkspace =
  async (
    scope: string
  ): Promise<void> => {
    /*
     * Clear must participate in the exact same per-tool queue
     * as Save. This gives call order deterministic semantics:
     *
     * save -> clear  = cleared
     * clear -> save  = saved
     */
    while (workspaceResetPromise) {
      await workspaceResetPromise;
    }

    const queueKey =
      safeToolScope(
        scope
      );

    const previous =
      toolSaveQueues.get(
        queueKey
      ) ??
      Promise.resolve();

    const run =
      previous.then(
        () =>
          clearToolWorkspaceUnserialized(
            scope
          )
      );

    const settled =
      run.then(
        () => undefined,
        () => undefined
      );

    toolSaveQueues.set(
      queueKey,
      settled
    );

    try {
      await run;
    } finally {
      if (
        toolSaveQueues.get(
          queueKey
        ) === settled
      ) {
        toolSaveQueues.delete(
          queueKey
        );
      }
    }
  };
