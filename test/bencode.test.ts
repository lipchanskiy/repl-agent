import { describe, it, expect } from "vitest";
import { encode, decodeAt, IncompleteDataError } from "../src/backends/nrepl/bencode.js";

describe("bencode encode", () => {
  it("encodes integers", () => {
    expect(encode(42).toString()).toBe("i42e");
    expect(encode(-3).toString()).toBe("i-3e");
    expect(encode(0).toString()).toBe("i0e");
  });

  it("encodes strings", () => {
    expect(encode("foo").toString()).toBe("3:foo");
    expect(encode("").toString()).toBe("0:");
    expect(encode("hello world").toString()).toBe("11:hello world");
  });

  it("encodes lists", () => {
    expect(encode(["foo", "bar"]).toString()).toBe("l3:foo3:bare");
    expect(encode([]).toString()).toBe("le");
    expect(encode([1, "x"]).toString()).toBe("li1e1:xe");
  });

  it("encodes dicts with sorted keys", () => {
    // keys must be sorted: "id" < "op"
    const buf = encode({ op: "eval", id: "abc" });
    expect(buf.toString()).toBe("d2:id3:abc2:op4:evale");
  });

  it("encodes nested structures", () => {
    const msg = { op: "clone", id: "x" };
    const decoded = decodeAt(encode(msg), 0);
    expect(decoded[0]).toEqual({ id: "x", op: "clone" });
  });
});

describe("bencode decodeAt", () => {
  const dec = (s: string) => decodeAt(Buffer.from(s, "utf8"), 0);

  it("decodes integers", () => {
    expect(dec("i42e")[0]).toBe(42);
    expect(dec("i-3e")[0]).toBe(-3);
    expect(dec("i0e")[0]).toBe(0);
  });

  it("decodes strings", () => {
    expect(dec("3:foo")[0]).toBe("foo");
    expect(dec("0:")[0]).toBe("");
    expect(dec("5:hello")[0]).toBe("hello");
  });

  it("decodes lists", () => {
    expect(dec("l3:foo3:bare")[0]).toEqual(["foo", "bar"]);
    expect(dec("le")[0]).toEqual([]);
  });

  it("decodes dicts", () => {
    expect(dec("d2:op4:evale")[0]).toEqual({ op: "eval" });
  });

  it("returns correct offset", () => {
    const buf = Buffer.from("3:fooi42e", "utf8");
    const [v1, off1] = decodeAt(buf, 0);
    expect(v1).toBe("foo");
    const [v2] = decodeAt(buf, off1);
    expect(v2).toBe(42);
  });

  it("throws IncompleteDataError on truncated data", () => {
    expect(() => decodeAt(Buffer.from("i42"), 0)).toThrow(IncompleteDataError);
    expect(() => decodeAt(Buffer.from("3:fo"), 0)).toThrow(IncompleteDataError);
    expect(() => decodeAt(Buffer.from("l3:fo"), 0)).toThrow(IncompleteDataError);
    expect(() => decodeAt(Buffer.alloc(0), 0)).toThrow(IncompleteDataError);
  });

  it("handles UTF-8 multi-byte characters correctly", () => {
    const str = "héllo";
    const encoded = encode(str);
    const [decoded] = decodeAt(encoded, 0);
    expect(decoded).toBe(str);
  });
});
