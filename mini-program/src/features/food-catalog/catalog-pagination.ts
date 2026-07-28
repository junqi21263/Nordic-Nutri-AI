import type { ProductFoodCatalogItem, ProductFoodCatalogSearch } from "../../api/food-catalog-api";

export type CatalogPagination = NonNullable<ProductFoodCatalogSearch["pagination"]>;

export function appendCatalogItems(
  current: ProductFoodCatalogItem[],
  next: ProductFoodCatalogItem[],
) {
  const seen = new Set(current.map((item) => item.foodGroupId ?? item.id));
  return [...current, ...next.filter((item) => {
    const key = item.foodGroupId ?? item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
}

export function canLoadMoreCatalogItems(
  pagination: CatalogPagination | undefined,
  isLoading: boolean,
) {
  return Boolean(pagination?.hasMore) && !isLoading;
}
