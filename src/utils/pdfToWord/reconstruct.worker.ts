import { makeDocx } from "./docx.ts";
import type { PageModel } from "./model.ts";
self.onmessage = async (event: MessageEvent<{ pages: PageModel[] }>) => {
  try {
    const result = await makeDocx(event.data.pages);
    self.postMessage({ type: "done", ...result }, { transfer: [result.bytes] });
  } catch (e) {
    self.postMessage({
      type: "error",
      message:
        e instanceof Error ? e.message : "Document reconstruction failed.",
    });
  }
};
