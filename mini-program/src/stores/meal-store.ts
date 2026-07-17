import { create } from "zustand";
import {
  createMealFixtures,
  getDailySummary,
  type DailySummary,
  type Meal,
  type MealLoadingState,
  type MealType,
} from "../features/meals/domain";
import { getLocalDateString } from "../features/onboarding/domain";
import type {
  MealCreateInput,
  MealListInput,
  MealListResult,
  MealMutationInput,
  MealRepositoryClient,
} from "../repositories/meal-repository";

export type MealTypeFilter = MealType | "all" | "favorite";
let idCounter = 0;
const createLocalId = () => `local-meal-${Date.now()}-${++idCounter}`;

export interface MealStore {
  meals: Meal[];
  fixtureMeals: Meal[];
  dataSource: "fixture" | "supabase";
  initialDate: string;
  selectedDate: string;
  searchKeyword: string;
  mealTypeFilter: MealTypeFilter;
  visibleLimit: number;
  loadingState: MealLoadingState;
  errorState: string | null;
  editingMealId: string | null;
  forceProgressFallback: boolean;
  nextOffset: number;
  hasMore: boolean;
  requestGeneration: number;
  addMeal: (meal: Omit<Meal, "id"> & { id?: string }) => string;
  updateMeal: (id: string, changes: Partial<Omit<Meal, "id">>) => void;
  deleteMeal: (id: string) => void;
  toggleFavorite: (id: string) => void;
  getMealById: (id: string | undefined) => Meal | undefined;
  getMealsByDate: (date?: string) => Meal[];
  searchMeals: (keyword: string) => Meal[];
  filterMeals: () => Meal[];
  getDailySummary: (date?: string) => DailySummary;
  resetFixtures: () => void;
  setSelectedDate: (date: string) => void;
  setSearchKeyword: (keyword: string) => void;
  setMealTypeFilter: (filter: MealTypeFilter) => void;
  loadMore: () => void;
  setLoadingState: (state: MealLoadingState) => void;
  setErrorState: (error: string | null) => void;
  setEditingMealId: (id: string | null) => void;
  setForceProgressFallback: (value: boolean) => void;
  loadRemote: () => Promise<void>;
  loadMoreRemote: () => Promise<void>;
  createRemote: (input: MealCreateInput) => Promise<Meal>;
  updateRemote: (id: string, input: MealMutationInput) => Promise<Meal>;
  archiveRemote: (id: string) => Promise<Meal>;
  restoreRemote: (id: string) => Promise<Meal>;
  resetUserData: () => void;
}

export interface MealRemoteRepository {
  list: (input: MealListInput) => Promise<MealListResult>;
  create: (input: MealCreateInput) => Promise<Meal>;
  update: (id: string, input: MealMutationInput) => Promise<Meal>;
  archive: (id: string) => Promise<Meal>;
  restore: (id: string) => Promise<Meal>;
}
export interface MealStorage {
  read: () => Meal[] | null;
  write: (meals: Meal[]) => void;
  clear: () => void;
}

const cloneMeals = (meals: Meal[]) =>
  meals.map((meal) => ({ ...meal, items: meal.items.map((item) => ({ ...item })) }));
const sortMeals = (meals: Meal[]) =>
  [...meals].sort((left, right) => left.time.localeCompare(right.time));
const mealStorageKey = "nordic-nutri:meals:v1";
type NativeStorage = {
  getStorageSync: (key: string) => unknown;
  setStorageSync: (key: string, value: unknown) => void;
  removeStorageSync: (key: string) => void;
};
const nativeStorage = () => (globalThis as { wx?: NativeStorage }).wx;
const taroMealStorage: MealStorage = {
  read: () => {
    try {
      const stored = nativeStorage()?.getStorageSync(mealStorageKey);
      return Array.isArray(stored) ? (stored as Meal[]) : null;
    } catch {
      return null;
    }
  },
  write: (meals) => {
    try {
      nativeStorage()?.setStorageSync(mealStorageKey, meals);
    } catch {
      // Local persistence is best-effort and never blocks a meal action.
    }
  },
  clear: () => {
    try {
      nativeStorage()?.removeStorageSync(mealStorageKey);
    } catch {
      // Local persistence is best-effort and never blocks fixture reset.
    }
  },
};

export function createMealStore(
  fixtures = createMealFixtures(getLocalDateString()),
  initialDate = getLocalDateString(),
  storage?: MealStorage,
  remoteRepository?: MealRemoteRepository,
  remoteDataSource = Boolean(remoteRepository),
) {
  const initialFixtures = cloneMeals(fixtures);
  const persistedMeals = storage?.read();
  const initialMeals = persistedMeals?.length
    ? cloneMeals(persistedMeals)
    : cloneMeals(initialFixtures);
  const persistMeals = (meals: Meal[]) => storage?.write(cloneMeals(meals));
  const remoteListInput = (state: MealStore, offset: number): MealListInput => ({
    date: state.selectedDate,
    ...(state.mealTypeFilter !== "all" && state.mealTypeFilter !== "favorite"
      ? { mealType: state.mealTypeFilter }
      : {}),
    ...(state.searchKeyword.trim() ? { keyword: state.searchKeyword.trim() } : {}),
    offset,
    limit: 12,
  });
  const replaceMeal = (meals: Meal[], meal: Meal) =>
    meals.some((entry) => entry.id === meal.id)
      ? meals.map((entry) => (entry.id === meal.id ? meal : entry))
      : [...meals, meal];
  return create<MealStore>((set, get) => ({
    meals: initialMeals,
    fixtureMeals: initialFixtures,
    dataSource: remoteDataSource ? "supabase" : "fixture",
    initialDate,
    selectedDate: initialDate,
    searchKeyword: "",
    mealTypeFilter: "all",
    visibleLimit: 12,
    loadingState: "normal",
    errorState: null,
    editingMealId: null,
    forceProgressFallback: false,
    nextOffset: 0,
    hasMore: false,
    requestGeneration: 0,
    addMeal: (meal) => {
      const id =
        meal.id && !get().meals.some((entry) => entry.id === meal.id) ? meal.id : createLocalId();
      const meals = [...get().meals, { ...meal, id }];
      persistMeals(meals);
      set({ meals });
      return id;
    },
    updateMeal: (id, changes) => {
      const meals = get().meals.map((meal) =>
        meal.id === id
          ? {
              ...meal,
              ...changes,
              items: changes.items ? changes.items.map((item) => ({ ...item })) : meal.items,
            }
          : meal,
      );
      persistMeals(meals);
      set({ meals });
    },
    deleteMeal: (id) => {
      const meals = get().meals.filter((meal) => meal.id !== id);
      persistMeals(meals);
      set((state) => ({
        meals,
        editingMealId: state.editingMealId === id ? null : state.editingMealId,
      }));
    },
    toggleFavorite: (id) => {
      const meals = get().meals.map((meal) =>
        meal.id === id ? { ...meal, favorite: !meal.favorite } : meal,
      );
      persistMeals(meals);
      set({ meals });
    },
    getMealById: (id) => get().meals.find((meal) => meal.id === id),
    getMealsByDate: (date = get().selectedDate) =>
      sortMeals(get().meals.filter((meal) => meal.date === date)),
    searchMeals: (keyword) => {
      const normalized = keyword.trim().toLocaleLowerCase();
      if (!normalized) return get().getMealsByDate();
      return get()
        .getMealsByDate()
        .filter(
          (meal) =>
            meal.title.toLocaleLowerCase().includes(normalized) ||
            meal.items.some((item) => item.name.toLocaleLowerCase().includes(normalized)),
        );
    },
    filterMeals: () => {
      const state = get();
      const searched = state.searchMeals(state.searchKeyword);
      const filtered =
        state.mealTypeFilter === "all"
          ? searched
          : state.mealTypeFilter === "favorite"
            ? searched.filter((meal) => meal.favorite)
            : searched.filter((meal) => meal.mealType === state.mealTypeFilter);
      return filtered.slice(0, state.visibleLimit);
    },
    getDailySummary: (date = get().selectedDate) => getDailySummary(get().meals, date),
    resetFixtures: () => {
      storage?.clear();
      set((state) => ({
        meals: cloneMeals(state.fixtureMeals),
        selectedDate: state.initialDate,
        searchKeyword: "",
        mealTypeFilter: "all",
        visibleLimit: 12,
        loadingState: "normal",
        errorState: null,
        editingMealId: null,
        nextOffset: 0,
        hasMore: false,
        requestGeneration: state.requestGeneration + 1,
      }));
    },
    setSelectedDate: (selectedDate) =>
      set((state) => ({
        selectedDate,
        visibleLimit: 12,
        searchKeyword: "",
        mealTypeFilter: "all",
        nextOffset: 0,
        hasMore: false,
        requestGeneration: state.requestGeneration + 1,
      })),
    setSearchKeyword: (searchKeyword) => set((state) => ({
      searchKeyword,
      visibleLimit: 12,
      nextOffset: 0,
      hasMore: false,
      requestGeneration: state.requestGeneration + 1,
    })),
    setMealTypeFilter: (mealTypeFilter) => set((state) => ({
      mealTypeFilter,
      visibleLimit: 12,
      nextOffset: 0,
      hasMore: false,
      requestGeneration: state.requestGeneration + 1,
    })),
    loadMore: () => set((state) => ({ visibleLimit: state.visibleLimit + 12 })),
    setLoadingState: (loadingState) => set({ loadingState }),
    setErrorState: (errorState) =>
      set({ errorState, loadingState: errorState ? "error" : "normal" }),
    setEditingMealId: (editingMealId) => set({ editingMealId }),
    setForceProgressFallback: (forceProgressFallback) => set({ forceProgressFallback }),
    loadRemote: async () => {
      if (!remoteRepository) return;
      const state = get();
      const generation = state.requestGeneration;
      set({ dataSource: "supabase", meals: [], loadingState: "loading", errorState: null });
      try {
        const result = await remoteRepository.list(remoteListInput(state, 0));
        if (generation !== get().requestGeneration) return;
        set({
          dataSource: "supabase",
          meals: cloneMeals(result.meals),
          visibleLimit: Math.max(12, result.meals.length),
          nextOffset: result.meals.length,
          hasMore: result.hasMore,
          loadingState: result.meals.length ? "normal" : "empty",
          errorState: null,
        });
      } catch {
        if (generation !== get().requestGeneration) return;
        set({ loadingState: "error", errorState: "餐次加载失败，请稍后重试" });
      }
    },
    loadMoreRemote: async () => {
      if (!remoteRepository) return;
      const state = get();
      if (!state.hasMore || state.loadingState === "loading") return;
      const generation = state.requestGeneration;
      set({ loadingState: "loading", errorState: null });
      try {
        const result = await remoteRepository.list(remoteListInput(state, state.nextOffset));
        if (generation !== get().requestGeneration) return;
        set((current) => ({
          meals: replaceRemoteMeals(current.meals, result.meals),
          visibleLimit: current.visibleLimit + result.meals.length,
          nextOffset: current.nextOffset + result.meals.length,
          hasMore: result.hasMore,
          loadingState: "normal",
        }));
      } catch {
        if (generation !== get().requestGeneration) return;
        set({ loadingState: "error", errorState: "更多餐次加载失败，请稍后重试" });
      }
    },
    createRemote: async (input) => {
      if (!remoteRepository) throw new Error("远程餐次保存能力不可用");
      const meal = await remoteRepository.create(input);
      set((state) => ({
        meals: replaceMeal(state.meals, meal),
        loadingState: "normal",
        errorState: null,
      }));
      return meal;
    },
    updateRemote: async (id, input) => {
      if (!remoteRepository) throw new Error("远程餐次保存能力不可用");
      const meal = await remoteRepository.update(id, input);
      set((state) => ({ meals: replaceMeal(state.meals, meal), loadingState: "normal", errorState: null }));
      return meal;
    },
    archiveRemote: async (id) => {
      if (!remoteRepository) throw new Error("远程餐次保存能力不可用");
      const meal = await remoteRepository.archive(id);
      set((state) => ({
        meals: state.meals.filter((entry) => entry.id !== id),
        editingMealId: state.editingMealId === id ? null : state.editingMealId,
        loadingState: "normal",
        errorState: null,
      }));
      return meal;
    },
    restoreRemote: async (id) => {
      if (!remoteRepository) throw new Error("远程餐次保存能力不可用");
      const meal = await remoteRepository.restore(id);
      set((state) => ({
        meals: meal.date === state.selectedDate ? replaceMeal(state.meals, meal) : state.meals,
        loadingState: "normal",
        errorState: null,
      }));
      return meal;
    },
    resetUserData: () => {
      storage?.clear();
      set((state) => ({
        meals: remoteRepository ? [] : cloneMeals(state.fixtureMeals),
        selectedDate: state.initialDate,
        searchKeyword: "",
        mealTypeFilter: "all",
        visibleLimit: 12,
        loadingState: remoteRepository ? "empty" : "normal",
        errorState: null,
        editingMealId: null,
        nextOffset: 0,
        hasMore: false,
        requestGeneration: state.requestGeneration + 1,
      }));
    },
  }));
}

function replaceRemoteMeals(current: Meal[], incoming: Meal[]) {
  const incomingIds = new Set(incoming.map((meal) => meal.id));
  return [...current.filter((meal) => !incomingIds.has(meal.id)), ...incoming];
}

export function createMealStoreWithRepository(
  repository: MealRemoteRepository,
  fixtures = createMealFixtures(getLocalDateString()),
  initialDate = getLocalDateString(),
) {
  return createMealStore(fixtures, initialDate, undefined, repository);
}

async function getProductionMealRepository() {
  const [{ getSupabaseClient }, { createMealRepository }] = await Promise.all([
    import("../lib/supabase-client"),
    import("../repositories/meal-repository"),
  ]);
  return createMealRepository(getSupabaseClient() as unknown as MealRepositoryClient);
}

const productionMealRepository: MealRemoteRepository = {
  async list(input) { return (await getProductionMealRepository()).list(input); },
  async create(input) { return (await getProductionMealRepository()).create(input); },
  async update(id, input) { return (await getProductionMealRepository()).update(id, input); },
  async archive(id) { return (await getProductionMealRepository()).archive(id); },
  async restore(id) { return (await getProductionMealRepository()).restore(id); },
};

export const useMealStore = createMealStore(
  undefined,
  undefined,
  taroMealStorage,
  productionMealRepository,
  false,
);
