import { describe, expect, it } from "vitest";
import { normalisePhone, isPlausiblePhone } from "@/lib/authProviders";

describe("client/server phone agreement", () => {
  // The exact forms an Indian worker types. Every one must reach the SAME
  // identifier the provider stores, because Convex Auth compares
  // account.providerAccountId against params.phone byte-for-byte.
  it.each([
    "9876543210",
    "09876543210",
    "+91 98765 43210",
    "+91-98765-43210",
    "98765 43210",
    "+919876543210",
  ])("%s normalises to +919876543210", (input) => {
    expect(normalisePhone(input)).toBe("+919876543210");
  });

  it("accepts every form the worker might actually type", () => {
    for (const input of ["9876543210", "09876543210", "+91 98765 43210"]) {
      expect(isPlausiblePhone(input)).toBe(true);
    }
  });

  it("still rejects nonsense", () => {
    for (const input of ["", "12345", "not a phone"]) {
      expect(isPlausiblePhone(input)).toBe(false);
    }
  });

  it("never produces a double country code from a trunk zero", () => {
    expect(normalisePhone("09876543210")).not.toBe("+9109876543210");
  });
});
