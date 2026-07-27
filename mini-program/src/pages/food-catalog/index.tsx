import { Input, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
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
import {
  FOOD_TAGS,
  resolveCategorySearchQuery,
  getFoodCategory,
  getFoodTags,
  matchesFoodFilters,
  type FoodCategory,
  type FoodTag,
} from "../../features/food-catalog/food-labels";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useFoodSelectionStore } from "../../stores/food-selection-store";

const numberText = (value: number | null, suffix: string) =>
  value === null ? "—" : `${Math.round(value)}${suffix}`;

const CATEGORY_ICONS: Record<string, NordicIconName> = {
  meat: "protein",
  seafood: "food-fish",
  egg: "food-egg",
  dairy: "food-milk",
  soy: "food-bean",
  grain: "carbs",
  vegetable: "food-carrot",
  fruit: "food-apple",
  beverage: "food-cup",
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
  { label: "肉禽", category: "肉禽", code: "meat", icon: "protein" },
  { label: "鱼虾海鲜", category: "鱼虾海鲜", code: "seafood", icon: "food-fish" },
  { label: "蛋类", category: "蛋类", code: "egg", icon: "food-egg" },
  { label: "乳制品", category: "乳制品", code: "dairy", icon: "food-milk" },
  { label: "豆制品", category: "豆制品", code: "soy", icon: "food-bean" },
  { label: "谷物", category: "谷物", code: "grain", icon: "carbs" },
  { label: "蔬菜", category: "蔬菜", code: "vegetable", icon: "food-carrot" },
  { label: "水果", category: "水果", code: "fruit", icon: "food-apple" },
  { label: "饮料", category: "饮料", code: "beverage", icon: "food-cup" },
  { label: "调味品", category: "调味品", code: "seasoning", icon: "food-salt" },
  { label: "混合菜", category: "混合菜", code: "mixed_dish", icon: "food-pot" },
  { label: "其他", category: "其他", code: "other", icon: "utensils" },
];

function suggestionLabel(item: ProductFoodSuggestion) {
  return item.nameZh || item.nameEn || item.brandName || "未命名食物";
}

export default function FoodCatalogPage() {
  const feedback = useFeedbackStore();
  const inspectFood = useFoodSelectionStore((state) => state.inspectFood);
  const addRecentFood = useFoodSelectionStore((state) => state.addRecentFood);
  const selectFood = useFoodSelectionStore((state) => state.selectFood);
  const recentFoods = useFoodSelectionStore((state) => state.recentFoods);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ProductFoodCatalogItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<FoodCategory>("全部");
  const [tagFilter, setTagFilter] = useState<FoodTag>("全部");
  const [serverCategories, setServerCategories] = useState<ProductFoodCategory[]>([]);
  const [serverTags, setServerTags] = useState<ProductFoodTag[]>([]);
  const [suggestions, setSuggestions] = useState<ProductFoodSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionSeq = useRef(0);

  const categoryChips = useMemo(() => {
    if (!serverCategories.length) return FALLBACK_CATEGORY_CHIPS;
    return serverCategories
      .filter((category) => category.isActive)
      .map((category) => ({
        label: category.nameZh,
        category: category.nameZh as FoodCategory,
        code: category.code,
        icon: CATEGORY_ICONS[category.code] ?? ("utensils" as NordicIconName),
      }));
  }, [serverCategories]);

  const tagChips = useMemo(() => {
    if (!serverTags.length) return [...FOOD_TAGS];
    return ["全部", ...serverTags.filter((tag) => tag.isActive).map((tag) => tag.nameZh)];
  }, [serverTags]);

  const visibleItems = useMemo(
    () => items.filter((food) => matchesFoodFilters(food, categoryFilter, tagFilter)),
    [categoryFilter, items, tagFilter],
  );
  const popularItems = visibleItems.slice(0, hasSearched ? 20 : 10);
  const recentItems = (recentFoods.length ? recentFoods : visibleItems.slice(0, 3)).slice(0, 6);

  const discover = async (limit = 10, isFiltered = false) => {
    setIsSearching(true);
    try {
      const result = await discoverProductFoodCatalog(limit);
      setItems(result.items);
      setHasSearched(isFiltered);
    } catch {
      feedback.show({ message: "食物库暂时不可用，请稍后重试", tone: "error" });
    } finally {
      setIsSearching(false);
    }
  };

  const loadTaxonomy = async () => {
    try {
      const [categories, tags] = await Promise.all([
        getProductFoodCategories(),
        getProductFoodTags(),
      ]);
      setServerCategories(categories.items ?? []);
      setServerTags(tags.items ?? []);
    } catch {
      // Keep fallback chips when taxonomy APIs are unavailable.
    }
  };

  useDidShow(() => {
    void discover();
    void loadTaxonomy();
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
      await discover();
      return;
    }
    // Every category chip queries USDA/cache with a dedicated English keyword set.
    const keyword = resolveCategorySearchQuery(category, categoryCode);
    if (!keyword) {
      await discover();
      return;
    }
    setIsSearching(true);
    try {
      const result = await searchProductFoodCatalog(keyword);
      setItems(result.items);
      setHasSearched(true);
    } catch {
      feedback.show({ message: "食物库暂时不可用，请稍后重试", tone: "error" });
    } finally {
      setIsSearching(false);
    }
  };

  const search = async (forcedQuery?: string) => {
    const keyword = (forcedQuery ?? query).trim();
    if (keyword.length < 2) {
      feedback.show({ message: "请输入至少两个字母或汉字", tone: "error" });
      return;
    }
    setIsSearching(true);
    setShowSuggestions(false);
    try {
      const result = await searchProductFoodCatalog(keyword);
      setItems(result.items);
      setHasSearched(true);
      setCategoryFilter("全部");
      setTagFilter("全部");
    } catch {
      feedback.show({ message: "食物库暂时不可用，请稍后重试", tone: "error" });
    } finally {
      setIsSearching(false);
    }
  };

  const pickSuggestion = (item: ProductFoodSuggestion) => {
    const label = suggestionLabel(item);
    setQuery(label);
    setShowSuggestions(false);
    void search(label);
  };

  const inspect = (food: ProductFoodCatalogItem) => {
    inspectFood(food);
    addRecentFood(food);
    const pages = Taro.getCurrentPages();
    const fromManualMeal =
      pages.length > 1 && pages[pages.length - 2]?.route === "pages/manual-meal/index";
    void Taro.navigateTo({
      url: `/pages/food-detail/index${fromManualMeal ? "?mode=select" : ""}`,
    });
  };

  const quickAdd = (food: ProductFoodCatalogItem) => {
    selectFood(food);
    addRecentFood(food);
    feedback.show({ message: "已选中，前往手动记录", tone: "success" });
    void Taro.navigateTo({ url: "/pages/manual-meal/index" });
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
          <NordicIcon name="utensils" size={20} ariaLabel="搜索食物" />
          <Input
            value={query}
            maxlength={80}
            confirmType="search"
            placeholder="搜索食物或扫码"
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
                const active = categoryFilter === chip.category;
                return (
                  <View
                    className={`food-catalog-category ${active ? "food-catalog-category--active" : ""}`}
                    key={chip.label}
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

        {recentItems.length ? (
          <View className="food-catalog-section">
            <Text className="food-catalog-section__title">最近记录</Text>
            <View className="food-catalog-rail food-catalog-rail--recent">
              <ScrollView
                className="food-catalog-recent"
                scrollX
                showScrollbar={false}
                scrollWithAnimation
              >
                <View className="food-catalog-recent__row">
                  {recentItems.map((food) => (
                    <View className="food-catalog-recent-card" key={food.id} onClick={() => inspect(food)}>
                      <FoodThumbnail className="food-catalog-recent-card__image" food={food} iconSize={20} />
                      <Text className="food-catalog-recent-card__name">{food.description}</Text>
                      <Text className="food-catalog-recent-card__meta">
                        {numberText(food.caloriesKcalPer100g, " kcal/100g")}
                      </Text>
                      <View
                        className="food-catalog-recent-card__add"
                        ariaLabel="快速添加"
                        onClick={(event) => {
                          event.stopPropagation();
                          quickAdd(food);
                        }}
                      >
                        <NordicIcon name="circle-plus" size={16} ariaLabel="快速添加" />
                      </View>
                    </View>
                  ))}
                  <View className="food-catalog-rail__spacer food-catalog-rail__spacer--wide" />
                </View>
              </ScrollView>
            </View>
          </View>
        ) : null}

        <View className="food-catalog-section">
          <Text className="food-catalog-section__title">
            {hasSearched ? "搜索结果" : "热门推荐"}
          </Text>
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
                    ariaLabel="快速添加"
                    onClick={(event) => {
                      event.stopPropagation();
                      quickAdd(food);
                    }}
                  >
                    <NordicIcon name="circle-plus" size={20} ariaLabel="快速添加" />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View className="food-catalog-empty">
              <NordicIcon name="sparkles" size={30} ariaLabel="食物库提示" />
              <Text className="food-catalog-empty__title">
                {isSearching ? "正在加载食物库" : "暂未找到匹配食物"}
              </Text>
              <Text className="food-catalog-empty__copy">
                可尝试中文或英文食物名，例如 beef、鸡胸肉、salmon。
              </Text>
            </View>
          )}
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
      </View>
    </PageLayout>
  );
}
