import {
  writeOpfsFile,
} from './opfsCompat';

import type {
  ExtractedImage,
} from './pdfEngine';


export const EXTRACT_IMAGES_DIRECTORY =
  'oneinto1-extract-images-output-v1';


const safeFileName =
  (
    value:
      string
  ) =>
    value.replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );


const hasOpfs =
  () =>
    typeof navigator !==
      'undefined' &&
    Boolean(
      navigator.storage
    ) &&
    typeof navigator.storage
      .getDirectory ===
      'function';


export const clearExtractImagesStorage =
  async (): Promise<void> => {
    if (!hasOpfs()) {
      return;
    }


    try {
      const root =
        await navigator.storage
          .getDirectory();


      await root.removeEntry(
        EXTRACT_IMAGES_DIRECTORY,
        {
          recursive:
            true,
        }
      );
    } catch (_) {
      // Already absent.
    }
  };


export const persistExtractedImageToOpfs =
  async (
    image:
      ExtractedImage
  ): Promise<ExtractedImage> => {
    if (!hasOpfs()) {
      throw new Error(
        'Browser-local storage is unavailable for large image extraction.'
      );
    }


    const storedName =
      `image-${safeFileName(
        image.id
      )}.png`;


    /*
     * Persist this ONE extracted image immediately.
     *
     * The original full-resolution image is not kept as an
     * accumulated JavaScript Blob while later pages are scanned.
     */
    await writeOpfsFile(
      EXTRACT_IMAGES_DIRECTORY,
      storedName,
      image.blob
    );


    const root =
      await navigator.storage
        .getDirectory();


    const directory =
      await root
        .getDirectoryHandle(
          EXTRACT_IMAGES_DIRECTORY,
          {
            create:
              false,
          }
        );


    const handle =
      await directory
        .getFileHandle(
          storedName,
          {
            create:
              false,
          }
        );


    const storedFile =
      await handle.getFile();


    return {
      ...image,

      /*
       * File extends Blob.
       *
       * This is now browser-storage-backed rather than the
       * temporary extraction Blob living in JS memory.
       */
      blob:
        storedFile,
    };
  };
