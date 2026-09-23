import { strToU8 } from "fflate";
import { CompatibleZip } from "./zip.ts";
import { emu, fitPage, safeLink } from "./geometry.ts";
import type { Size, SlidePage, SlideText } from "./model.ts";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export const escapeXml = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex -- Reject invalid PDF control characters.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
const rel = (id: string, type: string, target: string, external = false) =>
  `<Relationship Id="${id}" Type="${R}/${type}" Target="${escapeXml(target)}"${external ? ' TargetMode="External"' : ""}/>`;
const rels = (items: string) =>
  `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`;
const group =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const transform = (x: number, y: number, w: number, h: number, rotation = 0) =>
  `<a:xfrm${rotation ? ` rot="${Math.round(rotation * 60000)}"` : ""}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${Math.max(1, emu(w))}" cy="${Math.max(1, emu(h))}"/></a:xfrm>`;
function textShape(
  t: SlideText,
  id: number,
  fit: ReturnType<typeof fitPage>,
): string {
  const color = /^[0-9a-f]{6}$/i.test(t.color) ? t.color : "000000";
  const size = Math.max(
    100,
    Math.min(400000, Math.round(t.size * fit.scale * 100)),
  );
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${transform(fit.x + t.x * fit.scale, fit.y + t.y * fit.scale, t.width * fit.scale, t.height * fit.scale, t.rotation)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr rtl="${t.rtl ? 1 : 0}" algn="l"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr><a:r><a:rPr lang="en-US" sz="${size}" b="${t.bold ? 1 : 0}" i="${t.italic ? 1 : 0}" spc="${Math.round(t.spacing * fit.scale * 100)}"><a:solidFill><a:srgbClr val="${color}"><a:alpha val="${Math.round(t.opacity * 100000)}"/></a:srgbClr></a:solidFill><a:latin typeface="${escapeXml(t.font)}"/><a:ea typeface="${escapeXml(t.font)}"/><a:cs typeface="${escapeXml(t.font)}"/></a:rPr><a:t xml:space="preserve">${escapeXml(t.text)}</a:t></a:r><a:endParaRPr sz="${size}"/></a:p></p:txBody></p:sp>`;
}
/** Incremental ZIP writer. Only one page's raw image/XML is retained by the worker. */
export class PresentationPackage {
  private zip: CompatibleZip;
  private count = 0;
  private bytes = 0;
  private ended = false;
  private size: Size;
  constructor(
    size: Size,
    ondata: (error: Error | null, data: Uint8Array, final: boolean) => void,
  ) {
    this.size = size;
    this.zip = new CompatibleZip(ondata);
  }
  private add(path: string, value: string | Uint8Array) {
    const bytes = typeof value === "string" ? strToU8(value) : value;
    this.bytes += bytes.length;
    // fflate writes ZIP32. Fail explicitly before overflowing sizes/entry counts.
    if (this.bytes > 3_500_000_000 || this.count > 15000)
      throw Error(
        "The presentation is too large. Convert a smaller page range.",
      );
    this.zip.add(path, bytes, typeof value === "string");
  }
  addPage(page: SlidePage) {
    if (this.ended) throw Error("Presentation already completed.");
    const n = ++this.count,
      fit = fitPage(page, this.size);
    let id = 2;
    let shapes = `<p:pic><p:nvPicPr><p:cNvPr id="${id++}" name="PDF page ${page.sourcePage} artwork"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${transform(fit.x, fit.y, fit.width, fit.height)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    shapes += page.texts.map((t) => textShape(t, id++, fit)).join("");
    let relationships =
      rel("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml") +
      rel("rId2", "image", `../media/page${n}.${page.imageType}`);
    page.links.forEach((link, i) => {
      const url = safeLink(link.url);
      if (!url) return;
      const rid = `rId${i + 3}`;
      relationships += rel(rid, "hyperlink", url, true);
      shapes += `<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="Link"><a:hlinkClick r:id="${rid}"/></p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${transform(fit.x + link.x * fit.scale, fit.y + link.y * fit.scale, link.width * fit.scale, link.height * fit.scale)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"><a:alpha val="0"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
    });
    this.add(
      `ppt/slides/slide${n}.xml`,
      `${declaration}<p:sld xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld name="PDF page ${page.sourcePage}"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${group}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
    );
    this.add(`ppt/slides/_rels/slide${n}.xml.rels`, rels(relationships));
    this.add(`ppt/media/page${n}.${page.imageType}`, page.image);
  }
  finish() {
    if (this.ended || !this.count) throw Error("No slides were created.");
    this.ended = true;
    const numbers = Array.from({ length: this.count }, (_, i) => i + 1);
    const override = (path: string, type: string) =>
      `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.${type}+xml"/>`;
    this.add(
      "[Content_Types].xml",
      `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/>${override("ppt/presentation.xml", "presentation.main")}${override("ppt/slideMasters/slideMaster1.xml", "slideMaster")}${override("ppt/slideLayouts/slideLayout1.xml", "slideLayout")}<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${numbers.map((n) => override(`ppt/slides/slide${n}.xml`, "slide")).join("")}</Types>`,
    );
    this.add(
      "_rels/.rels",
      rels(rel("rId1", "officeDocument", "ppt/presentation.xml")),
    );
    this.add(
      "ppt/presentation.xml",
      `${declaration}<p:presentation xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${numbers.map((n) => `<p:sldId id="${255 + n}" r:id="rId${n + 1}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${emu(this.size.width)}" cy="${emu(this.size.height)}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`,
    );
    this.add(
      "ppt/_rels/presentation.xml.rels",
      rels(
        rel("rId1", "slideMaster", "slideMasters/slideMaster1.xml") +
          numbers
            .map((n) => rel(`rId${n + 1}`, "slide", `slides/slide${n}.xml`))
            .join(""),
      ),
    );
    const colorMap =
      '<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>';
    this.add(
      "ppt/slideMasters/slideMaster1.xml",
      `${declaration}<p:sldMaster xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree>${group}</p:spTree></p:cSld>${colorMap}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`,
    );
    this.add(
      "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      rels(
        rel("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml") +
          rel("rId2", "theme", "../theme/theme1.xml"),
      ),
    );
    this.add(
      "ppt/slideLayouts/slideLayout1.xml",
      `${declaration}<p:sldLayout xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
    );
    this.add(
      "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      rels(rel("rId1", "slideMaster", "../slideMasters/slideMaster1.xml")),
    );
    this.add(
      "ppt/theme/theme1.xml",
      `${declaration}<a:theme xmlns:a="${A}" name="PDF"><a:themeElements><a:clrScheme name="PDF">${[
        ["dk1", "000000"],
        ["lt1", "FFFFFF"],
        ["dk2", "222222"],
        ["lt2", "EEEEEE"],
        ["accent1", "008060"],
        ["accent2", "004080"],
        ["accent3", "804000"],
        ["accent4", "800040"],
        ["accent5", "408000"],
        ["accent6", "400080"],
        ["hlink", "0000FF"],
        ["folHlink", "800080"],
      ]
        .map(([k, v]) => `<a:${k}><a:srgbClr val="${v}"/></a:${k}>`)
        .join(
          "",
        )}</a:clrScheme><a:fontScheme name="PDF"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="PDF"><a:fillStyleLst>${Array(3).fill('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join("")}</a:fillStyleLst><a:lnStyleLst>${[6350, 12700, 19050].map((w) => `<a:ln w="${w}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>`).join("")}</a:lnStyleLst><a:effectStyleLst>${Array(3).fill("<a:effectStyle><a:effectLst/></a:effectStyle>").join("")}</a:effectStyleLst><a:bgFillStyleLst>${Array(3).fill('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join("")}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`,
    );
    this.zip.end();
  }
  terminate() {
    this.zip.terminate();
  }
}
