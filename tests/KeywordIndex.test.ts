import { describe, it, expect, beforeEach } from "vitest";
import { KeywordIndex } from "../backend/utils/KeywordIndex.js";

describe("KeywordIndex", () => {
  let index: KeywordIndex;

  beforeEach(() => {
    index = new KeywordIndex();
  });

  it("should match single word keywords", () => {
    index.build(
      [],
      [
        {
          id: "rule-1",
          keyword: "promo",
          responses: [{ text: "Halo ini promo!" }],
        },
      ],
    );

    const match = index.match("Halo kak ada promo menarik hari ini");
    expect(match).not.toBeNull();
    expect(match?.keyword).toBe("promo");
    expect(match?.type).toBe("trigger");
  });

  it("should match multi-word phrase keywords", () => {
    index.build(
      [],
      [
        {
          id: "rule-phrase",
          keywords: ["butuh akun", "beli bot"],
          responses: [{ text: "Siap melayani!" }],
        },
      ],
    );

    const match1 = index.match("Saya sedang butuh akun telegram murah");
    expect(match1).not.toBeNull();
    expect(match1?.keyword).toBe("butuh akun");

    const match2 = index.match("Mau beli bot telegram?");
    expect(match2).not.toBeNull();
    expect(match2?.keyword).toBe("beli bot");
  });

  it("should handle case insensitivity and punctuation", () => {
    index.build(
      [],
      [
        {
          id: "rule-case",
          keyword: "LilyBot",
          responses: [{ text: "LilyBot hadir!" }],
        },
      ],
    );

    const match = index.match("Halo!! Apakah ini LILYBOT???");
    expect(match).not.toBeNull();
    expect(match?.type).toBe("trigger");
  });

  it("should return null when no keywords match", () => {
    index.build(
      [],
      [
        {
          id: "rule-1",
          keyword: "diskon",
          responses: [{ text: "Diskon 50%" }],
        },
      ],
    );

    const match = index.match("Selamat pagi semuanya!");
    expect(match).toBeNull();
  });

  it("should support broadcast keywords", () => {
    index.build(
      [
        {
          id: "job-1",
          keywords: ["nokos ready"],
          targetGroup: "-100123456789",
          isActive: true,
        },
      ],
      [],
    );

    const match = index.match("info nokos ready hari ini");
    expect(match).not.toBeNull();
    expect(match?.type).toBe("broadcast");
  });
});
