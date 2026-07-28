import { requestProductApi } from "./product-api-client";

export interface ProductFoodImage {
  thumbnailUrl: string;
  listUrl: string;
  detailUrl: string;
  source: string;
  isFallback: boolean;
}

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
  image?: ProductFoodImage | null;
  sourceUrl: string | null;
}

export interface ProductFoodCatalogSearch {
  items: ProductFoodCatalogItem[];
  source: "cache" | "cache-stale" | "usda_fdc" | "fallback" | "standard_food_v1";
  page: number;
  pagination?: { page: number; pageSize: number; total: number; hasMore: boolean };
  resolvedQuery?: string;
}

export interface ProductFoodCatalogDiscovery {
  items: ProductFoodCatalogItem[];
  source: "cache" | "fallback" | "standard_food_v1";
}

export interface ProductFoodCategory {
  id: string;
  code: string;
  nameZh: string;
  nameEn: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ProductFoodTag {
  id: string;
  code: string;
  nameZh: string;
  nameEn: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ProductFoodSuggestion {
  id: string;
  nameZh: string | null;
  nameEn: string | null;
  brandName: string | null;
  calories: number;
  protein: number;
}

export function searchProductFoodCatalog(query: string, page = 1, options?: { categoryCode?: string }) {
  const params = new URLSearchParams({ page: String(page) });
  if (query.trim()) params.set("query", query.trim());
  if (options?.categoryCode) params.set("category", options.categoryCode);
  return requestProductApi<ProductFoodCatalogSearch>(
    `/foods?${params.toString()}`,
    { method: "GET", fallbackMessage: "食物库暂时不可用，请稍后重试" },
  );
}

export function discoverProductFoodCatalog(limit?: number) {
  const query =
    Number.isInteger(limit) && (limit as number) > 10
      ? `?limit=${Math.min(limit as number, 100)}`
      : "";
  return requestProductApi<ProductFoodCatalogDiscovery>(`/foods/discover${query}`, {
    method: "GET",
    fallbackMessage: "食物库暂时不可用，请稍后重试",
  });
}

export function getProductFoodCategories() {
  return requestProductApi<{ items: ProductFoodCategory[] }>("/foods/categories", {
    method: "GET",
    fallbackMessage: "食物分类暂时不可用，请稍后重试",
  });
}

export function getProductFoodTags() {
  return requestProductApi<{ items: ProductFoodTag[] }>("/foods/tags", {
    method: "GET",
    fallbackMessage: "食物标签暂时不可用，请稍后重试",
  });
}

export function getProductFoodSuggestions(query: string, limit = 8) {
  const q = query.trim();
  return requestProductApi<{ items: ProductFoodSuggestion[] }>(
    `/foods/suggestions?q=${encodeURIComponent(q)}&limit=${Math.min(Math.max(limit, 1), 10)}`,
    { method: "GET", fallbackMessage: "搜索建议暂时不可用，请稍后重试" },
  );
}

export function getProductFoodByBarcode(barcode: string) {
  return requestProductApi<{ food: unknown; source: string }>(
    `/foods/barcode/${encodeURIComponent(barcode)}`,
    { method: "GET", fallbackMessage: "条码查询暂时不可用，请稍后重试" },
  );
}
