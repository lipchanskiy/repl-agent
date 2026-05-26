// Bencode encoder/decoder for nREPL wire protocol.
// Format: integers i42e  strings 3:foo  lists l...e  dicts d...e

export type BencodeVal = string | number | BencodeVal[] | BencodeDict;
export type BencodeDict = { readonly [key: string]: BencodeVal };

export class IncompleteDataError extends Error {
  constructor() {
    super("Incomplete bencode data");
  }
}

export function encode(value: BencodeVal): Buffer {
  if (typeof value === "number") {
    return Buffer.from(`i${Math.trunc(value)}e`, "ascii");
  }
  if (typeof value === "string") {
    const data = Buffer.from(value, "utf8");
    return Buffer.concat([Buffer.from(`${data.length}:`, "ascii"), data]);
  }
  if (Array.isArray(value)) {
    const parts = value.map(encode);
    return Buffer.concat([Buffer.from("l"), ...parts, Buffer.from("e")]);
  }
  // dict — nREPL requires lexicographically sorted keys
  const dict = value as BencodeDict;
  const parts = Object.keys(dict)
    .sort()
    .flatMap((k) => [encode(k), encode(dict[k] as BencodeVal)]);
  return Buffer.concat([Buffer.from("d"), ...parts, Buffer.from("e")]);
}

// Returns [parsed value, offset after the value].
// Throws IncompleteDataError when the buffer ends before the value is complete.
export function decodeAt(buf: Buffer, offset: number): [BencodeVal, number] {
  const code = buf[offset];
  if (code === undefined) throw new IncompleteDataError();

  // Integer: i<digits>e
  if (code === 0x69) {
    const end = buf.indexOf(0x65, offset + 1); // 'e'
    if (end === -1) throw new IncompleteDataError();
    const n = parseInt(buf.slice(offset + 1, end).toString("ascii"), 10);
    return [n, end + 1];
  }

  // List: l<items>e
  if (code === 0x6c) {
    const list: BencodeVal[] = [];
    let pos = offset + 1;
    for (;;) {
      const peek = buf[pos];
      if (peek === undefined) throw new IncompleteDataError();
      if (peek === 0x65) return [list, pos + 1]; // 'e'
      const [val, next] = decodeAt(buf, pos);
      list.push(val);
      pos = next;
    }
  }

  // Dict: d<key><value>...e
  if (code === 0x64) {
    const dict: Record<string, BencodeVal> = {};
    let pos = offset + 1;
    for (;;) {
      const peek = buf[pos];
      if (peek === undefined) throw new IncompleteDataError();
      if (peek === 0x65) return [dict, pos + 1]; // 'e'
      const [key, keyEnd] = decodeAt(buf, pos);
      const [val, valEnd] = decodeAt(buf, keyEnd);
      dict[key as string] = val;
      pos = valEnd;
    }
  }

  // String: <length>:<data>
  let colonIdx = offset;
  while (colonIdx < buf.length && buf[colonIdx] !== 0x3a) colonIdx++; // ':'
  if (colonIdx >= buf.length) throw new IncompleteDataError();
  const len = parseInt(buf.slice(offset, colonIdx).toString("ascii"), 10);
  const dataEnd = colonIdx + 1 + len;
  if (dataEnd > buf.length) throw new IncompleteDataError();
  return [buf.slice(colonIdx + 1, dataEnd).toString("utf8"), dataEnd];
}
