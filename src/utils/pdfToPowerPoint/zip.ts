import { zipSync } from "fflate";
/** Emit one known-size ZIP entry at a time. Some Office readers reject stored
 * media entries with streaming data descriptors, even in otherwise valid ZIPs.
 * fflate supplies compression/CRC; only small central-directory records remain.
 */
export class CompatibleZip {
  private central: Uint8Array[] = [];
  private offset = 0;
  private stopped = false;
  private ondata: (
    error: Error | null,
    data: Uint8Array,
    final: boolean,
  ) => void;
  constructor(
    ondata: (error: Error | null, data: Uint8Array, final: boolean) => void,
  ) {
    this.ondata = ondata;
  }
  add(path: string, bytes: Uint8Array, compressed: boolean) {
    if (this.stopped) throw Error("Presentation packaging stopped.");
    const entry = zipSync({ [path]: [bytes, { level: compressed ? 6 : 0 }] });
    const footer = new DataView(
      entry.buffer,
      entry.byteOffset + entry.length - 22,
      22,
    );
    const centralOffset = footer.getUint32(16, true),
      centralLength = footer.getUint32(12, true);
    const central = entry.slice(centralOffset, centralOffset + centralLength);
    new DataView(central.buffer).setUint32(42, this.offset, true);
    this.central.push(central);
    this.offset += centralOffset;
    this.ondata(null, entry.subarray(0, centralOffset), false);
  }
  end() {
    if (this.stopped) throw Error("Presentation packaging stopped.");
    const count = this.central.length,
      size = this.central.reduce((n, c) => n + c.length, 0);
    const footer = new Uint8Array(22),
      view = new DataView(footer.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, count, true);
    view.setUint16(10, count, true);
    view.setUint32(12, size, true);
    view.setUint32(16, this.offset, true);
    for (const record of this.central) this.ondata(null, record, false);
    this.central = [];
    this.stopped = true;
    this.ondata(null, footer, true);
  }
  terminate() {
    this.stopped = true;
    this.central = [];
  }
}
