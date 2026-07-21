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

export type MealTypeFilter = MealType | "all" | "favorite";
let idCounter = 0;
const createLocalId = () => `local-meal-${Date.now()}-${++idCounter}`;

export interface MealStore {
  meals: Meal[];
  fixtureMeals: Meal[];
  dataSource: "fixture" | "remote";
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
  replaceRemoteMeals: (meals: Meal[], selectedDate?: string) => void;
  setSelectedDate: (date: string) => void;
  setSearchKeyword: (keyword: string) => void;
  setMealTypeFilter: (filter: MealTypeFilter) => void;
  loadMore: () => void;
  setLoadingState: (state: MealLoadingState) => void;
  setErrorState: (error: string | null) => void;
  setEditingMealId: (id: string | null) => void;
  setForceProgressFallback: (value: boolean) => void;
  resetUserData: () => void;
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
) {
  const initialFixtures = cloneMeals(fixtures);
  const persistedMeals = storage?.read();
  const initialMeals = persistedMeals?.length
    ? cloneMeals(persistedMeals)
    : cloneMeals(initialFixtures);
  const persistMeals = (meals: Meal[]) => storage?.write(cloneMeals(meals));
  return create<MealStore>((set, get) => ({
    meals: initialMeals,
    fixtureMeals: initialFixtures,
    dataSource: "fixture",
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
    replaceRemoteMeals: (meals, selectedDate = get().selectedDate) => {
      const nextMeals = cloneMeals(meals);
      persistMeals(nextMeals);
      set({
        meals: nextMeals,
        dataSource: "remote",
        selectedDate,
        loadingState: nextMeals.length ? "normal" : "empty",
        errorState: null,
      });
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
    setSearchKeyword: (searchKeyword) =>
      set((state) => ({
        searchKeyword,
        visibleLimit: 12,
        nextOffset: 0,
        hasMore: false,
        requestGeneration: state.requestGeneration + 1,
      })),
    setMealTypeFilter: (mealTypeFilter) =>
      set((state) => ({
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
    resetUserData: () => {
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
  }));
}

export const useMealStore = createMealStore(undefined, undefined, taroMealStorage);
