// Inline each decoder/font/CMap into a lazy JS asset so the existing PWA's JS
// precache covers it. Paths are a fixed build-time allowlist, never PDF URLs.
const modules = import.meta.glob<string>(
  [
    "../../../node_modules/pdfjs-word-dist/cmaps/*.bcmap",
    "../../../node_modules/pdfjs-word-dist/standard_fonts/*.pfb",
    "../../../node_modules/pdfjs-word-dist/standard_fonts/*.ttf",
    "../../../node_modules/pdfjs-word-dist/wasm/*.wasm",
  ],
  { query: "?url&inline", import: "default" },
);
const folders: Record<string, string> = {
  cMapUrl: "cmaps",
  standardFontDataUrl: "standard_fonts",
  wasmUrl: "wasm",
};
export class LocalPdfAssets {
  async fetch({
    kind,
    filename,
  }: {
    kind: string;
    filename: string;
  }): Promise<Uint8Array> {
    const folder = folders[kind];
    const load =
      modules[`../../../node_modules/pdfjs-word-dist/${folder}/${filename}`];
    if (!load)
      throw Error("This PDF requires an unavailable local rendering resource.");
    const url = await load();
    if (!url.startsWith("data:"))
      throw Error("The local rendering resource was not bundled correctly.");
    const base64 = url.slice(url.indexOf(",") + 1);
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  }
}
