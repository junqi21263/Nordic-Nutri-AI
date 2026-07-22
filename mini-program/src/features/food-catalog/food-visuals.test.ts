import { describe, expect, it } from "vitest";
import { resolveFoodVisual } from "./food-visuals";

describe("resolveFoodVisual", () => {
  it("uses a bundled category image when the catalog does not provide one", () => {
    const visual = resolveFoodVisual({
      description: "Chicken breast, cooked",
      imageUrl: null,
    });

    expect(visual).toMatch(/^(data:image\/svg\+xml|\/.+meal-bowl\.svg)/);
  });

  it("preserves a usable catalog image when one is available", () => {
    const visual = resolveFoodVisual({
      description: "Chicken breast, cooked",
      imageUrl: "https://images.openfoodfacts.org/images/products/chicken.jpg",
    });

    expect(visual).toBe("https://images.openfoodfacts.org/images/products/chicken.jpg");
  });
});
