import { describe, expect, it } from "vitest";
import { getFoodVisualFallback, resolveFoodVisual } from "./food-visuals";

describe("resolveFoodVisual", () => {
  it("returns null when the catalog does not provide a remote image", () => {
    expect(
      resolveFoodVisual({
        description: "Chicken breast, cooked",
        imageUrl: null,
      }),
    ).toBeNull();
  });

  it("allows Open Food Facts packaging urls when already cached", () => {
    expect(
      resolveFoodVisual({
        description: "Beef, NFS",
        imageUrl: "https://images.openfoodfacts.org/images/products/beef.jpg",
      }),
    ).toBe("https://images.openfoodfacts.org/images/products/beef.jpg");
  });

  it("prefers nested approved listUrl over flat imageUrl", () => {
    expect(
      resolveFoodVisual({
        description: "Chicken breast",
        imageUrl: "https://images.openfoodfacts.org/old.jpg",
        image: {
          thumbnailUrl: "https://cdn.tcloudbaseapp.com/thumb.webp",
          listUrl: "https://cdn.tcloudbaseapp.com/list.webp",
          detailUrl: "https://cdn.tcloudbaseapp.com/detail.webp",
          source: "hunyuan",
          isFallback: false,
        },
      }),
    ).toBe("https://cdn.tcloudbaseapp.com/list.webp");
  });

  it("ignores empty nested urls so placeholders can render", () => {
    expect(
      resolveFoodVisual({
        description: "Chicken breast",
        imageUrl: null,
        image: {
          thumbnailUrl: "",
          listUrl: "",
          detailUrl: "",
          source: "fallback",
          isFallback: true,
        },
      }),
    ).toBeNull();
  });
});

describe("getFoodVisualFallback", () => {
  it("always returns tone + icon so every list row can render a placeholder", () => {
    expect(getFoodVisualFallback({ description: "Chicken breast, cooked", imageUrl: null })).toEqual({
      tone: "meat",
      icon: "protein",
    });
    expect(getFoodVisualFallback({ description: "Unknown food", imageUrl: null })).toEqual({
      tone: "default",
      icon: "utensils",
    });
  });

  it("maps seafood descriptions to the seafood tone", () => {
    expect(getFoodVisualFallback({ description: "Salmon, Atlantic, cooked", imageUrl: null }).tone).toBe(
      "seafood",
    );
    expect(getFoodVisualFallback({ description: "Smoked mussels", imageUrl: null }).tone).toBe("seafood");
  });

  it("does not treat eggplant as an egg", () => {
    expect(getFoodVisualFallback({ description: "Eggplant, raw", imageUrl: null }).tone).toBe("produce");
    expect(getFoodVisualFallback({ description: "Egg, whole, cooked", imageUrl: null }).tone).toBe("egg");
  });

  it("maps grain, fruit and vegetable descriptions to grain/produce tones", () => {
    expect(getFoodVisualFallback({ description: "Oatmeal, cooked", imageUrl: null }).tone).toBe("grain");
    expect(getFoodVisualFallback({ description: "Banana, raw", imageUrl: null }).tone).toBe("produce");
    expect(getFoodVisualFallback({ description: "Tofu, firm", imageUrl: null }).tone).toBe("soy");
  });

  it("keeps Orange chicken on meat instead of matching fruit orange", () => {
    expect(getFoodVisualFallback({ description: "Orange chicken", imageUrl: null }).tone).toBe("meat");
  });
});
