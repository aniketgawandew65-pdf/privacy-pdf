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

export const saveWorkspaceFiles = async (
  files: File[]
): Promise<boolean> => {
  if (files.length === 0) {
    await clearWorkspaceFiles();
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
   * Remove old files for this workspace before saving
   * the new current selection.
   */
  try {
    for await (
      const name of directory.keys()
    ) {
      await directory.removeEntry(name);
    }
  } catch {
    // Some browsers may not expose async directory iteration.
    // The newly written manifest below still controls restoration.
  }

  const manifestFiles:
    WorkspaceFileMeta[] = [];

  try {
    for (
      let index = 0;
      index < files.length;
      index++
    ) {
      const file = files[index];

      const storedName =
        `file-${index}-${Date.now()}`;

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

    writeManifest({
      sessionId,
      files: manifestFiles,
    });

    return true;
  } catch (error) {
    console.warn(
      "Local workspace persistence unavailable:",
      error
    );

    return false;
  }
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

export const clearWorkspaceFiles =
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

export const resetWorkspaceSession =
  async (): Promise<void> => {
    await clearWorkspaceFiles();

    sessionStorage.removeItem(
      SESSION_KEY
    );
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
