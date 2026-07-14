import { describe, expect, it } from "vitest";
import { DormantRing } from "./dormantRing";

const enc = new TextEncoder();
const dec = new TextDecoder();

function drainToString(ring: DormantRing): string {
  const parts: string[] = [];
  ring.drain((b) => parts.push(dec.decode(b)));
  return parts.join("");
}

describe("DormantRing", () => {
  it("replays pushed bytes in order", () => {
    const ring = new DormantRing(64, 16);
    ring.push(enc.encode("hello "));
    ring.push(enc.encode("world"));
    expect(ring.byteLength()).toBe(11);
    expect(drainToString(ring)).toBe("hello world");
    expect(ring.byteLength()).toBe(0);
  });

  it("coalesces many tiny chunks without premature overflow", () => {
    const ring = new DormantRing(4096, 64);
    for (let i = 0; i < 1000; i++) ring.push(enc.encode("ab"));
    expect(ring.byteLength()).toBe(2000);
    expect(drainToString(ring)).toBe("ab".repeat(1000));
  });

  it("splits a chunk across block boundaries losslessly", () => {
    const ring = new DormantRing(1024, 8);
    const payload = "0123456789".repeat(5);
    ring.push(enc.encode(payload));
    expect(drainToString(ring)).toBe(payload);
  });

  it("drops oldest blocks on overflow and keeps the tail", () => {
    const ring = new DormantRing(32, 8);
    ring.push(enc.encode("AAAAAAAA"));
    ring.push(enc.encode("BBBBBBBB"));
    ring.push(enc.encode("CCCCCCCC"));
    ring.push(enc.encode("DDDDDDDD"));
    ring.push(enc.encode("EEEE\nFFFF"));
    const out = drainToString(ring);
    expect(out).toContain("FFFF");
    expect(out).not.toContain("AAAA");
  });

  it("never emits a terminal reset on overflow", () => {
    const ring = new DormantRing(16, 8);
    ring.push(enc.encode("x".repeat(100)));
    const out = drainToString(ring);
    expect(out).not.toContain("\x1bc");
    expect(out).toContain("dropped");
  });

  it("resyncs the tail to the next line boundary after overflow", () => {
    const ring = new DormantRing(16, 8);
    ring.push(enc.encode("AAAAAAAA"));
    ring.push(enc.encode("garbage\nclean line"));
    const out = drainToString(ring);
    const afterNotice = out.slice(out.indexOf("\x1b[0m\r\n") + 6);
    expect(afterNotice).toBe("clean line");
  });

  it("skips the partial line inside the first surviving block", () => {
    const ring = new DormantRing(24, 8);
    ring.push(enc.encode("12345678"));
    ring.push(enc.encode("abc\ndefg"));
    ring.push(enc.encode("99999999QQQQ"));
    const out = drainToString(ring);
    const afterNotice = out.slice(out.indexOf("\x1b[0m\r\n") + 6);
    expect(afterNotice).toBe("defg99999999QQQQ");
  });

  it("replays the first block as-is when it contains no LF", () => {
    const ring = new DormantRing(16, 8);
    ring.push(enc.encode("AAAAAAAA"));
    ring.push(enc.encode("BBBBBBBBCCCCCCCC"));
    const out = drainToString(ring);
    expect(out.endsWith("BBBBBBBBCCCCCCCC")).toBe(true);
  });

  it("does not emit a notice without overflow", () => {
    const ring = new DormantRing(1024, 16);
    ring.push(enc.encode("just some output"));
    expect(drainToString(ring)).toBe("just some output");
  });

  it("is reusable after drain", () => {
    const ring = new DormantRing(32, 8);
    ring.push(enc.encode("x".repeat(100)));
    drainToString(ring);
    ring.push(enc.encode("fresh"));
    expect(drainToString(ring)).toBe("fresh");
  });

  it("handles a single push far larger than the cap", () => {
    const ring = new DormantRing(32, 8);
    const big = `${"y".repeat(500)}\n${"tail".repeat(4)}`;
    ring.push(enc.encode(big));
    const out = drainToString(ring);
    expect(out).toContain("tail");
    expect(ring.byteLength()).toBe(0);
  });

  it("peek() reads content without clearing it", () => {
    const ring = new DormantRing(64, 16);
    ring.push(enc.encode("hello world"));

    const parts: string[] = [];
    ring.peek((b) => parts.push(dec.decode(b)));

    expect(parts.join("")).toBe("hello world");
    expect(ring.byteLength()).toBe(11);
    // A subsequent drain still sees the same content — peek didn't consume it.
    expect(drainToString(ring)).toBe("hello world");
  });

  it("peek() can be called repeatedly with identical results", () => {
    const ring = new DormantRing(64, 16);
    ring.push(enc.encode("repeat me"));

    const first: string[] = [];
    ring.peek((b) => first.push(dec.decode(b)));
    const second: string[] = [];
    ring.peek((b) => second.push(dec.decode(b)));

    expect(first.join("")).toBe(second.join(""));
  });

  it("previewNew()+commitFlushed() returns only bytes appended since the last commit, unlike peek()", () => {
    const ring = new DormantRing(64, 16);
    ring.push(enc.encode("first"));

    const a: string[] = [];
    ring.previewNew((b) => a.push(dec.decode(b)));
    ring.commitFlushed();
    expect(a.join("")).toBe("first");

    // A second call with nothing new pushed must return nothing — this is
    // the fix for the periodic scrollback flush re-appending the same bytes
    // on every 30s tick for a long-dormant session.
    const b: string[] = [];
    ring.previewNew((chunk) => b.push(dec.decode(chunk)));
    ring.commitFlushed();
    expect(b.join("")).toBe("");

    ring.push(enc.encode("second"));
    const c: string[] = [];
    ring.previewNew((chunk) => c.push(dec.decode(chunk)));
    ring.commitFlushed();
    expect(c.join("")).toBe("second");

    // Nothing was consumed for a later real drain().
    expect(drainToString(ring)).toBe("firstsecond");
  });

  it("previewNew()/commitFlushed() resets to empty after drain()", () => {
    const ring = new DormantRing(64, 16);
    ring.push(enc.encode("x"));
    ring.previewNew(() => {});
    ring.commitFlushed();
    drainToString(ring);

    ring.push(enc.encode("y"));
    const parts: string[] = [];
    ring.previewNew((b) => parts.push(dec.decode(b)));
    ring.commitFlushed();
    expect(parts.join("")).toBe("y");
  });

  it("previewNew()+commitFlushed() stays consistent across an overflow drop", () => {
    const ring = new DormantRing(16, 8);
    ring.push(enc.encode("AAAAAAAA"));
    ring.previewNew(() => {}); // mark the first block as already flushed
    ring.commitFlushed();
    ring.push(enc.encode("BBBBBBBB"));
    ring.push(enc.encode("CCCCCCCC")); // forces the AAAAAAAA block to drop

    const parts: string[] = [];
    ring.previewNew((b) => parts.push(dec.decode(b)));
    ring.commitFlushed();
    // The dropped block never re-appears, and nothing already-flushed repeats.
    expect(parts.join("")).not.toContain("A");
    expect(parts.join("")).toContain("BBBBBBBB");
    expect(parts.join("")).toContain("CCCCCCCC");
  });

  it("previewNew() without commitFlushed() re-offers the same bytes next time (failed-persist retry)", () => {
    const ring = new DormantRing(64, 16);
    ring.push(enc.encode("first"));

    // Simulates a scrollback_save that failed or hit the size cap: preview,
    // but never commit.
    const a: string[] = [];
    ring.previewNew((b) => a.push(dec.decode(b)));
    expect(a.join("")).toBe("first");

    // Without a commit in between, the same bytes must come back — the
    // whole point of splitting preview from commit.
    const b: string[] = [];
    ring.previewNew((chunk) => b.push(dec.decode(chunk)));
    expect(b.join("")).toBe("first");
  });

  it("commitFlushed() is a no-op if previewNew() hasn't been called since the last commit", () => {
    const ring = new DormantRing(64, 16);
    ring.push(enc.encode("first"));
    ring.previewNew(() => {});
    ring.commitFlushed();

    // Calling commitFlushed() again with no intervening previewNew() must
    // not advance anything further (there's nothing pending).
    ring.commitFlushed();
    ring.push(enc.encode("second"));
    const parts: string[] = [];
    ring.previewNew((b) => parts.push(dec.decode(b)));
    expect(parts.join("")).toBe("second");
  });
});
