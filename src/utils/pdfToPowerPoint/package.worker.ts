import { PresentationPackage } from "./package";
import type { Size, SlidePage } from "./model";
let pack: PresentationPackage | undefined;
self.onmessage = (
  event: MessageEvent<{
    id: number;
    type: "start" | "page" | "end";
    size: Size;
    page: SlidePage;
  }>,
) => {
  const { id, type, size, page } = event.data;
  try {
    if (type === "start")
      pack = new PresentationPackage(size, (error, data, final) => {
        if (error) throw error;
        self.postMessage(
          { type: "chunk", data, final },
          { transfer: [data.buffer] },
        );
      });
    else if (type === "page") {
      if (!pack) throw Error("Presentation not initialized.");
      pack.addPage(page);
    } else {
      if (!pack) throw Error("Presentation not initialized.");
      pack.finish();
    }
    self.postMessage({ type: "ack", id });
  } catch (error) {
    pack?.terminate();
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Unable to create presentation.",
    });
  }
};
