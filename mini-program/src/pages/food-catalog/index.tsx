import { Input, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useDidShow, useReachBottom } from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  discoverProductFoodCatalog,
  getProductFoodCategories,
  getProductFoodSuggestions,
  getProductFoodTags,
  searchProductFoodCatalog,
  type ProductFoodCatalogItem,
  type ProductFoodCategory,
  type ProductFoodSuggestion,
  type ProductFoodTag,
} from "../../api/food-catalog-api";
import { NordicIcon, type NordicIconName } from "../../components/nordic-icon";
import { FoodThumbnail } from "../../components/food-thumbnail";
import { LoadingState } from "../../components/loading-state";
import {
  FOOD_TAGS,
  STANDARD_FOOD_CATEGORY_ROOT_CODES,
  getFoodCategory,
  getFoodTags,
  matchesFoodFilters,
  type FoodCategory,
  type FoodTag,
} from "../../features/food-catalog/food-labels";
import {
  appendCatalogItems,
  canLoadMoreCatalogItems,
  pickRandomCatalogPage,
  shuffleCatalogItems,
  type CatalogPagination,
} from "../../features/food-catalog/catalog-pagination";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useFoodSelectionStore } from "../../stores/food-selection-store";

const numberText = (value: number | null, suffix: string) =>
  value === null ? "—" : `${Math.round(value)}${suffix}`;

const CATEGORY_ICONS: Record<string, NordicIconName> = {
  meat_poultry: "protein",
  meat: "protein",
  seafood: "food-fish",
  egg_dairy: "food-egg",
  egg: "food-egg",
  dairy: "food-milk",
  plant_protein: "food-bean",
  soy: "food-bean",
  grains_tubers: "carbs",
  grain: "carbs",
  vegetables: "food-carrot",
  vegetable: "food-carrot",
  fruits: "food-apple",
  fruit: "food-apple",
  nuts_seeds: "food-nuts",
  oils_seasonings: "food-oil",
  basic_processed: "food-bread",
  regional_staples: "food-bowl",
  nordic_staples: "food-fish",
  north_american_staples: "food-bread",
  beverage: "food-cup",
  beverages: "food-cup",
  seasoning: "food-salt",
  mixed_dish: "food-pot",
  other: "utensils",
};

const FALLBACK_CATEGORY_CHIPS: Array<{
  label: string;
  category: FoodCategory;
  code?: string;
  icon: NordicIconName;
}> = [
  { label: "全部", category: "全部", code: "all", icon: "utensils" },
  { label: "肉禽", category: "肉禽", code: "meat_poultry", icon: "protein" },
  { label: "鱼虾海鲜", category: "鱼虾海鲜", code: "seafood", icon: "food-fish" },
  { label: "蛋类与乳制品", category: "蛋类与乳制品", code: "egg_dairy", icon: "food-egg" },
  { label: "豆类与植物蛋白", category: "豆类与植物蛋白", code: "plant_protein", icon: "food-bean" },
  { label: "谷物与薯类", category: "谷物与薯类", code: "grains_tubers", icon: "carbs" },
  { label: "蔬菜", category: "蔬菜", code: "vegetables", icon: "food-carrot" },
  { label: "水果", category: "水果", code: "fruits", icon: "food-apple" },
  { label: "坚果与种子", category: "坚果与种子", code: "nuts_seeds", icon: "food-nuts" },
  { label: "油脂与调味", category: "油脂与调味", code: "oils_seasonings", icon: "food-oil" },
  { label: "饮品", category: "饮品", code: "beverages", icon: "food-cup" },
  { label: "烘焙与基础加工食材", category: "烘焙与基础加工食材", code: "basic_processed", icon: "food-bread" },
  { label: "地域特色常用食材", category: "地域特色常用食材", code: "regional_staples", icon: "food-bowl" },
  { label: "北欧常见食材", category: "北欧常见食材", code: "nordic_staples", icon: "food-fish" },
  { label: "北美常见食材", category: "北美常见食材", code: "north_american_staples", icon: "food-bread" },
];

function suggestionLabel(item: ProductFoodSuggestion) {
  return item.nameZh || item.nameEn || item.brandName || "未命名食物";
}

export default function FoodCatalogPage() {
  const feedback = useFeedbackStore();
  const inspectFood = useFoodSelectionStore((state) => state.inspectFood);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ProductFoodCatalogItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);
  const [pagination, setPagination] = useState<CatalogPagination>();
  const [categoryFilter, setCategoryFilter] = useState<FoodCategory>("全部");
  const [activeCategoryCode, setActiveCategoryCode] = useState<string | undefined>("all");
  const [tagFilter, setTagFilter] = useState<FoodTag>("全部");
  const [serverCategories, setServerCategories] = useState<ProductFoodCategory[]>([]);
  const [serverTags, setServerTags] = useState<ProductFoodTag[]>([]);
  const [suggestions, setSuggestions] = useState<ProductFoodSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionSeq = useRef(0);
  const catalogQueryRef = useRef("");
  const catalogCategoryRef = useRef<string | undefined>();
  const paginationRef = useRef<CatalogPagination>();
  const loadMoreLockRef = useRef(false);
  const didBootstrapRef = useRef(false);
  const taxonomyLoadedRef = useRef(false);

  const categoryChips = useMemo(() => {
    const serverChips = serverCategories
      .filter((category) => category.isActive && STANDARD_FOOD_CATEGORY_ROOT_CODES.has(category.code))
      .map((category) => ({
        label: category.nameZh,
        category: category.nameZh as FoodCategory,
        code: category.code,
        icon: CATEGORY_ICONS[category.code] ?? ("utensils" as NordicIconName),
      }));
    const byCode = new Map(serverChips.filter((chip) => chip.code).map((chip) => [chip.code, chip]));
    const merged = FALLBACK_CATEGORY_CHIPS.map((fallback) => byCode.get(fallback.code ?? "") ?? fallback);
    for (const chip of serverChips) {
      if (chip.code && !merged.some((item) => item.code === chip.code)) merged.push(chip);
    }
    const seenLabels = new Set<string>();
    return merged.filter((chip) => {
      if (seenLabels.has(chip.label)) return false;
      seenLabels.add(chip.label);
      return true;
    });
  }, [serverCategories]);

  const tagChips = useMemo(() => {
    if (!serverTags.length) return [...FOOD_TAGS];
    return ["全部", ...serverTags.filter((tag) => tag.isActive).map((tag) => tag.nameZh)];
  }, [serverTags]);

  const visibleItems = useMemo(
    () => items.filter((food) => matchesFoodFilters(
      food,
      activeCategoryCode && activeCategoryCode !== "all" ? "全部" : categoryFilter,
      tagFilter,
    )),
    [activeCategoryCode, categoryFilter, items, tagFilter],
  );
  const popularItems = visibleItems;

  const discover = async (limit = 20, page = 1, options?: { replace?: boolean }) => {
    const replacingPage = options?.replace ?? page === 1;
    setIsSearching(true);
    if (replacingPage) setIsPageLoading(true);
    try {
      const result = await discoverProductFoodCatalog(limit, page);
      setItems((current) => (replacingPage ? result.items : appendCatalogItems(current, result.items)));
      setPagination(result.pagination);
      paginationRef.current = result.pagination;
      setHasSearched(false);
      setActiveCategoryCode("all");
      catalogQueryRef.current = "";
      catalogCategoryRef.current = undefined;
    } catch {
      feedback.show({ message: "食物库暂时不可用，请稍后重试", tone: "error" });
    } finally {
      setIsSearching(false);
      if (replacingPage) setIsPageLoading(false);
    }
  };

  const loadTaxonomy = async () => {
    if (taxonomyLoadedRef.current) return;
    try {
      const [categories, tags] = await Promise.all([
        getProductFoodCategories(),
        getProductFoodTags(),
      ]);
      setServerCategories(categories.items ?? []);
      setServerTags(tags.items ?? []);
      taxonomyLoadedRef.current = true;
    } catch {
      // Keep fallback chips when taxonomy APIs are unavailable.
    }
  };

  useDidShow(() => {
    void loadTaxonomy();
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;
    void discover();
  });

  const loadCatalogPage = async ({
    query: searchQuery,
    categoryCode,
    page,
    replace,
  }: {
    query: string;
    categoryCode?: string;
    page: number;
    replace: boolean;
  }) => {
    const loadingMore = !replace;
    if (loadingMore) {
      if (loadMoreLockRef.current) return;
      loadMoreLockRef.current = true;
    }
    setIsSearching(true);
    if (replace) setIsPageLoading(true);
    try {
      const result = await searchProductFoodCatalog(searchQuery, page, { categoryCode });
      setItems((current) => (replace ? result.items : appendCatalogItems(current, result.items)));
      setPagination(result.pagination);
      paginationRef.current = result.pagination;
      setHasSearched(searchQuery.trim().length > 0);
      setActiveCategoryCode(categoryCode);
      catalogQueryRef.current = searchQuery;
      catalogCategoryRef.current = categoryCode;
    } catch {
      feedback.show({ message: "食物库暂时不可用，请稍后重试", tone: "error" });
    } finally {
      setIsSearching(false);
      if (replace) setIsPageLoading(false);
      if (loadingMore) loadMoreLockRef.current = false;
    }
  };

  const loadNextCatalogPage = async () => {
    const currentPagination = paginationRef.current;
    if (!currentPagination || !canLoadMoreCatalogItems(currentPagination, loadMoreLockRef.current)) return;
    if (activeCategoryCode === "all") {
      if (loadMoreLockRef.current) return;
      loadMoreLockRef.current = true;
      try {
        await discover(20, currentPagination.page + 1);
      } finally {
        loadMoreLockRef.current = false;
      }
      return;
    }
    await loadCatalogPage({
      query: catalogQueryRef.current,
      categoryCode: catalogCategoryRef.current,
      page: currentPagination.page + 1,
      replace: false,
    });
  };

  useReachBottom(() => {
    if (paginationRef.current?.hasMore) void loadNextCatalogPage();
  });

  useEffect(() => {
    const keyword = query.trim();
    // Skip autocomplete for long USDA-style descriptions pasted into the box
    // (e.g. "Beef, cured, corned beef, canned") — those go straight to search.
    const looksLikeFullDescription = keyword.length > 40 || (keyword.includes(",") && keyword.length > 24);
    if (keyword.length < 1 || looksLikeFullDescription) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const seq = ++suggestionSeq.current;
    const timer = setTimeout(() => {
      void getProductFoodSuggestions(keyword, 8)
        .then((result) => {
          if (seq !== suggestionSeq.current) return;
          setSuggestions(result.items ?? []);
          setShowSuggestions(true);
        })
        .catch(() => {
          if (seq !== suggestionSeq.current) return;
          setSuggestions([]);
          setShowSuggestions(false);
        });
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  const updateCategory = async (category: FoodCategory, categoryCode?: string) => {
    setCategoryFilter(category);
    setTagFilter("全部");
    setShowSuggestions(false);
    if (category === "全部") {
      setQuery("");
      await discover(20, 1);
      return;
    }
    if (!categoryCode) {
      await discover();
      return;
    }
    await loadCatalogPage({ query: "", categoryCode, page: 1, replace: true });
  };

  const search = async (forcedQuery?: string) => {
    const keyword = (forcedQuery ?? query).trim();
    if (keyword.length < 2) {
      feedback.show({ message: "请输入至少两个字母或汉字", tone: "error" });
      return;
    }
    setShowSuggestions(false);
    setCategoryFilter("全部");
    setTagFilter("全部");
    await loadCatalogPage({ query: keyword, page: 1, replace: true });
  };

  const pickSuggestion = (item: ProductFoodSuggestion) => {
    const label = suggestionLabel(item);
    setQuery(label);
    setShowSuggestions(false);
    void search(label);
  };

  const inspect = (food: ProductFoodCatalogItem) => {
    inspectFood(food);
    const pages = Taro.getCurrentPages();
    const fromManualMeal =
      pages.length > 1 && pages[pages.length - 2]?.route === "pages/manual-meal/index";
    void Taro.navigateTo({
      url: `/pages/food-detail/index${fromManualMeal ? "?mode=select" : ""}`,
    });
  };

  const refreshPopular = async () => {
    if (hasSearched || isSearching || isPageLoading) return;
    const page = pickRandomCatalogPage(paginationRef.current);
    if (!activeCategoryCode || activeCategoryCode === "all") {
      await discover(20, page, { replace: true });
      setItems((current) => shuffleCatalogItems(current));
      return;
    }
    await loadCatalogPage({
      query: catalogQueryRef.current,
      categoryCode: catalogCategoryRef.current ?? activeCategoryCode,
      page,
      replace: true,
    });
    setItems((current) => shuffleCatalogItems(current));
  };

  return (
    <PageLayout
      title="食物库"
      activeTab="food-catalog"
      hideNavigation
      className="page-layout--food-catalog"
    >
      <View className="food-catalog-page">
        <View className="food-catalog-search food-catalog-search--pill">
          <NordicIcon name="search" size={20} ariaLabel="搜索食物" />
          <Input
            value={query}
            maxlength={80}
            confirmType="search"
            placeholder="搜索食物名称"
            onConfirm={() => void search()}
            onFocus={() => {
              if (suggestions.length) setShowSuggestions(true);
            }}
            onBlur={() => {
              // Delay so suggestion taps register before the list hides.
              setTimeout(() => setShowSuggestions(false), 180);
            }}
            onInput={(event) => setQuery(event.detail.value)}
          />
          <View
            className="food-catalog-search__action"
            ariaLabel="搜索"
            onClick={() => void search()}
          >
            <Text>{isSearching ? "查询中" : "搜索"}</Text>
          </View>
        </View>

        {showSuggestions && suggestions.length ? (
          <View className="food-catalog-suggestions">
            {suggestions.map((item) => (
              <View
                className="food-catalog-suggestions__item"
                key={item.id}
                onClick={() => pickSuggestion(item)}
              >
                <Text className="food-catalog-suggestions__name">{suggestionLabel(item)}</Text>
                <Text className="food-catalog-suggestions__meta">
                  {Math.round(item.calories)} kcal · {Math.round(item.protein)}g 蛋白
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View className="food-catalog-rail food-catalog-rail--categories">
          <ScrollView
            className="food-catalog-categories"
            scrollX
            showScrollbar={false}
            scrollWithAnimation
          >
            <View className="food-catalog-categories__row">
              {categoryChips.map((chip) => {
                const active = chip.code === activeCategoryCode
                  || (!chip.code && !activeCategoryCode && categoryFilter === chip.category);
                return (
                  <View
                    className={`food-catalog-category ${active ? "food-catalog-category--active" : ""}`}
                    key={chip.code ?? chip.label}
                    onClick={() => void updateCategory(chip.category, chip.code)}
                  >
                    <View className={`food-catalog-category__icon ${active ? "food-catalog-category__icon--active" : ""}`}>
                      <NordicIcon name={chip.icon} size={22} ariaLabel={chip.label} />
                    </View>
                    <Text className="food-catalog-category__label">{chip.label}</Text>
                  </View>
                );
              })}
              <View className="food-catalog-rail__spacer" />
            </View>
          </ScrollView>
        </View>

        <View className="food-catalog-rail food-catalog-rail--tags">
          <ScrollView
            className="food-catalog-tags"
            scrollX
            showScrollbar={false}
            scrollWithAnimation
          >
            <View className="food-catalog-tags__row">
              {tagChips.map((tag) => (
                <View
                  className={`food-catalog-filter ${tagFilter === tag ? "food-catalog-filter--active" : ""}`}
                  key={tag}
                  onClick={() => setTagFilter(tag)}
                >
                  <Text>{tag}</Text>
                </View>
              ))}
              <View className="food-catalog-rail__spacer" />
            </View>
          </ScrollView>
        </View>

        <View className="food-catalog-section">
          {isPageLoading ? <LoadingState label="正在加载食物库…" /> : (
            <>
              <View className="food-catalog-section__header">
                <Text className="food-catalog-section__title">
                  {hasSearched ? "搜索结果" : "热门推荐"}
                </Text>
                {!hasSearched ? (
                  <View
                    className={`food-catalog-section__refresh ${isSearching ? "food-catalog-section__refresh--loading" : ""}`}
                    ariaLabel="换一批热门推荐"
                    onClick={() => void refreshPopular()}
                  >
                    <NordicIcon name="refresh-cw" size={16} ariaLabel="换一批" />
                    <Text>换一批</Text>
                  </View>
                ) : null}
              </View>
              {popularItems.length ? (
                <View className="food-catalog-popular">
                  {popularItems.map((food) => (
                    <View className="food-catalog-popular-card" key={food.id} onClick={() => inspect(food)}>
                      <FoodThumbnail className="food-catalog-popular-card__image" food={food} iconSize={22} />
                      <View className="food-catalog-popular-card__copy">
                        <Text className="food-catalog-popular-card__name">{food.description}</Text>
                        <View className="food-catalog-popular-card__meta">
                          <Text>{numberText(food.caloriesKcalPer100g, " kcal")}</Text>
                          <Text>{numberText(food.proteinGPer100g, "g 蛋白")}</Text>
                          <Text>{numberText(food.carbsGPer100g, "g 碳水")}</Text>
                        </View>
                        <View className="food-catalog-item__labels">
                          <Text className="food-catalog-item__category">{getFoodCategory(food)}</Text>
                          {getFoodTags(food).slice(0, 2).map((tag) => (
                            <Text className="food-catalog-item__tag" key={tag}>
                              {tag}
                            </Text>
                          ))}
                        </View>
                      </View>
                      <View
                        className="food-catalog-popular-card__add"
                        ariaLabel="查看食物详情"
                        onClick={() => inspect(food)}
                      >
                        <NordicIcon name="chevron-right" size={20} ariaLabel="查看食物详情" />
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="food-catalog-empty">
                  <NordicIcon name="food-bowl" size={30} ariaLabel="食物库提示" />
                  <Text className="food-catalog-empty__title">
                    {isSearching ? "正在加载食物库" : "暂未找到匹配食物"}
                  </Text>
                  <Text className="food-catalog-empty__copy">
                    可尝试中文或英文食物名，例如 beef、鸡胸肉、salmon。
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

      </View>
    </PageLayout>
  );
}
