/**
 * Minimal ZIP writer, used to hand back a batch of STL files as one download.
 *
 * Entries are stored uncompressed: STL geometry does not deflate well enough to justify
 * pulling in a compression library, and every unzip tool reads stored entries.
 */

export interface ZipEntry {
    name: string;
    data: Uint8Array;
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(data: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed date and time fields, as the ZIP format stores them. */
function dosDateTime(date: Date): { time: number; date: number } {
    return {
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f),
        date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
}

export function createZip(entries: ZipEntry[], now = new Date()): Uint8Array {
    const encoder = new TextEncoder();
    const { time, date } = dosDateTime(now);

    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBytes = encoder.encode(entry.name);
        const crc = crc32(entry.data);

        const local = new Uint8Array(30 + nameBytes.length);
        const localView = new DataView(local.buffer);
        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true); // version needed to extract
        localView.setUint16(6, 0x0800, true); // filenames are UTF-8
        localView.setUint16(8, 0, true); // stored, not deflated
        localView.setUint16(10, time, true);
        localView.setUint16(12, date, true);
        localView.setUint32(14, crc, true);
        localView.setUint32(18, entry.data.length, true);
        localView.setUint32(22, entry.data.length, true);
        localView.setUint16(26, nameBytes.length, true);
        localView.setUint16(28, 0, true); // no extra field
        local.set(nameBytes, 30);

        const central = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(central.buffer);
        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true); // version made by
        centralView.setUint16(6, 20, true); // version needed to extract
        centralView.setUint16(8, 0x0800, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint16(12, time, true);
        centralView.setUint16(14, date, true);
        centralView.setUint32(16, crc, true);
        centralView.setUint32(20, entry.data.length, true);
        centralView.setUint32(24, entry.data.length, true);
        centralView.setUint16(28, nameBytes.length, true);
        centralView.setUint32(42, offset, true);
        central.set(nameBytes, 46);

        locals.push(local, entry.data);
        centrals.push(central);
        offset += local.length + entry.data.length;
    }

    const centralSize = centrals.reduce((total, part) => total + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);

    const parts = [...locals, ...centrals, end];
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const part of parts) {
        out.set(part, cursor);
        cursor += part.length;
    }
    return out;
}
