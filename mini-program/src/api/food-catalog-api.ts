import { requestProductApi } from "./product-api-client";

export interface ProductFoodCatalogItem {
  id: string;
  source: string;
  sourceFoodId: string;
  description: string;
  brandName: string | null;
  dataType: string | null;
  category: string | null;
  servingSize: number | null;
  servingUnit: string | null;
  caloriesKcalPer100g: number | null;
  proteinGPer100g: number | null;
  carbsGPer100g: number | null;
  fatGPer100g: number | null;
  imageUrl: string | null;
  sourceUrl: string | null;
}

export interface ProductFoodCatalogSearch {
  items: ProductFoodCatalogItem[];
  source: "cache" | "cache-stale" | "usda_fdc" | "fallback";
  page: number;
  resolvedQuery?: string;
}

export interface ProductFoodCatalogDiscovery {
  items: ProductFoodCatalogItem[];
  source: "cache" | "fallback";
}

export function searchProductFoodCatalog(query: string, page = 1) {
  return requestProductApi<ProductFoodCatalogSearch>(
    `/foods?query=${encodeURIComponent(query)}&page=${page}`,
    { method: "GET", fallbackMessage: "食物库暂时不可用，请稍后重试" },
  );
}

export function discoverProductFoodCatalog() {
  return requestProductApi<ProductFoodCatalogDiscovery>("/foods/discover", {
    method: "GET",
    fallbackMessage: "食物库暂时不可用，请稍后重试",
  });
}
