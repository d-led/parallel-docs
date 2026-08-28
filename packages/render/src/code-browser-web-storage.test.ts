import { describe, expect, it, vi } from "vitest";

import { readWebStorageItem, writeWebStorageItem } from "./code-browser-web-storage.js";

describe("Reading SideTrack keys from web storage", () => {
  it("returns null when getItem throws (e.g. file URL / hardened storage)", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException("nope", "SecurityError");
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } as unknown as Storage;
    expect(readWebStorageItem(storage, "k")).toBeNull();
  });

  it("returns the stored value when getItem succeeds", () => {
    const storage = {
      getItem: vi.fn(() => "v"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } as unknown as Storage;
    expect(readWebStorageItem(storage, "k")).toBe("v");
  });
});

describe("Writing SideTrack keys to web storage", () => {
  it("ignores when setItem throws", () => {
    const setItem = vi.fn(() => {
      throw new DOMException("nope", "QuotaExceededError");
    });
    const storage = {
      getItem: vi.fn(),
      setItem,
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } as unknown as Storage;
    expect(() => writeWebStorageItem(storage, "k", "v")).not.toThrow();
    expect(setItem).toHaveBeenCalledWith("k", "v");
  });
});
