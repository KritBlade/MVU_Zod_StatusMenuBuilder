// stored-zip.js — a minimal ZIP writer for the artifact archives (pack-authoring-plan B6). v0.1
//
// STORED entries only (method 0, no compression): every member is a small text file, so
// compressing buys kilobytes and costs a deflate implementation or a dependency on a host
// library this app cannot rely on. Any unzip tool reads method 0.
//
// DETERMINISTIC on purpose: the timestamp is a fixed constant, so the same members yield the
// same bytes — the test suite can assert output byte-for-byte, and re-exporting an unchanged
// project produces an identical archive instead of a spurious diff.
//
// Pure: [{ path, text }] in, Uint8Array out. Node and browser share it (same reasoning as the
// rt_ parts — one copy, both realms).

// CRC-32 (ISO 3309), table-driven — ZIP's one non-trivial requirement.
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

export function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

// A fixed DOS date/time (2026-01-01 00:00:00) — see the determinism note above.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const enc = new TextEncoder();

function push16(arr, v) { arr.push(v & 0xff, (v >>> 8) & 0xff); }
function push32(arr, v) { arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); }

// Members: [{ path, text }] — forward-slash paths, UTF-8 names (general-purpose flag bit 11).
// Directory entries are not emitted; every mainstream extractor creates parents from file paths.
export function buildStoredZip(members) {
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const m of members) {
        const name = enc.encode(String(m.path));
        const data = enc.encode(String(m.text));
        const crc = crc32(data);

        const local = [];
        push32(local, 0x04034b50);          // local file header
        push16(local, 20);                  // version needed
        push16(local, 0x0800);              // flags: UTF-8 name
        push16(local, 0);                   // method: stored
        push16(local, DOS_TIME);
        push16(local, DOS_DATE);
        push32(local, crc);
        push32(local, data.length);         // compressed == uncompressed (stored)
        push32(local, data.length);
        push16(local, name.length);
        push16(local, 0);                   // no extra field
        const localHeader = new Uint8Array(local);

        const cd = [];
        push32(cd, 0x02014b50);             // central directory header
        push16(cd, 20);                     // version made by
        push16(cd, 20);                     // version needed
        push16(cd, 0x0800);
        push16(cd, 0);
        push16(cd, DOS_TIME);
        push16(cd, DOS_DATE);
        push32(cd, crc);
        push32(cd, data.length);
        push32(cd, data.length);
        push16(cd, name.length);
        push16(cd, 0);                      // extra
        push16(cd, 0);                      // comment
        push16(cd, 0);                      // disk number
        push16(cd, 0);                      // internal attrs
        push32(cd, 0);                      // external attrs
        push32(cd, offset);                 // local header offset
        central.push({ header: new Uint8Array(cd), name });

        chunks.push(localHeader, name, data);
        offset += localHeader.length + name.length + data.length;
    }

    const cdStart = offset;
    for (const c of central) {
        chunks.push(c.header, c.name);
        offset += c.header.length + c.name.length;
    }

    const end = [];
    push32(end, 0x06054b50);                // end of central directory
    push16(end, 0);                         // disk
    push16(end, 0);                         // cd disk
    push16(end, members.length);
    push16(end, members.length);
    push32(end, offset - cdStart);          // cd size
    push32(end, cdStart);                   // cd offset
    push16(end, 0);                         // comment length
    chunks.push(new Uint8Array(end));

    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
}
