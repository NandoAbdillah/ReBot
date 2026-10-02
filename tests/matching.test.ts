import { describe, it, expect } from "vitest";
import {
  normalizeTarget,
  normalizeNumericId,
  normalizeForKeyword,
  buildTelegramMessageLink,
  matchesSingleKeyword,
  formatTargetId,
  toIdVariants,
} from "../backend/utils/matching.js";

describe("matching utils", () => {
  it("normalizeTarget strips leading @ and converts to lowercase", () => {
    expect(normalizeTarget("@MyChannel")).toBe("mychannel");
    expect(normalizeTarget("  @SomeGroup  ")).toBe("somegroup");
    expect(normalizeTarget("alreadyClean")).toBe("alreadyclean");
  });

  it("normalizeNumericId normalizes telegram channel / supergroup ids", () => {
    expect(normalizeNumericId("-1001234567890")).toBe("1234567890");
    expect(normalizeNumericId("-987654321")).toBe("987654321");
    expect(normalizeNumericId("mychannel")).toBe("mychannel");
  });

  it("normalizeForKeyword normalizes accents and special symbols", () => {
    expect(normalizeForKeyword("Héllo, World!!")).toBe("hello world");
    expect(normalizeForKeyword("  LilyBot -- Bot Otomatis  ")).toBe(
      "lilybot bot otomatis",
    );
  });

  it("buildTelegramMessageLink creates valid message links", () => {
    const linkUser = buildTelegramMessageLink("mygroup", "12345", 42);
    expect(linkUser).toBe("https://t.me/mygroup/42");

    const linkId = buildTelegramMessageLink("", "-1001987654321", 99);
    expect(linkId).toBe("https://t.me/c/1987654321/99");
  });

  it("matchesSingleKeyword correctly matches keyword in text", () => {
    expect(
      matchesSingleKeyword("halo kak ada promo nih", "promo"),
    ).toBe(true);
    expect(
      matchesSingleKeyword("halo kak ada promo nih", "diskon"),
    ).toBe(false);
  });

  it("formatTargetId formats ids with -100 prefix for supergroups", () => {
    expect(formatTargetId("1234567890")).toBe("-1001234567890");
    expect(formatTargetId("@mychannel")).toBe("@mychannel");
  });

  it("toIdVariants generates all channel id representations", () => {
    const variants = toIdVariants("-1001234567890");
    expect(variants).toContain("1234567890");
    expect(variants).toContain("-1001234567890");
  });
});
