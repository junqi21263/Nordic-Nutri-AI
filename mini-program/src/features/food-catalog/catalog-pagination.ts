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

export function shuffleCatalogItems(
  items: ProductFoodCatalogItem[],
  random: () => number = Math.random,
) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function pickRandomCatalogPage(
  pagination: CatalogPagination | undefined,
  random: () => number = Math.random,
) {
  if (!pagination || pagination.total <= 0 || pagination.pageSize <= 0) return 1;
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  return 1 + Math.floor(random() * totalPages);
}
