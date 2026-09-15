import type { Meal } from "./domain";
export function getRecentFrequentMeals(meals: Meal[]) {
  const groups = new Map<string, { meal: Meal; count: number }>();
  for (const meal of meals) {
    if (!meal.items.length) continue;
    const key = JSON.stringify(meal.items.map((item) => item.name.trim().toLowerCase()).sort());
    const group = groups.get(key);
    if (!group) groups.set(key, { meal, count: 1 });
    else {
      group.count++;
      if (`${meal.date} ${meal.time}` > `${group.meal.date} ${group.meal.time}`) group.meal = meal;
    }
  }
  return [...groups.values()].filter((group) => group.count >= 2).sort((a, b) => b.count - a.count || `${b.meal.date} ${b.meal.time}`.localeCompare(`${a.meal.date} ${a.meal.time}`)).slice(0, 3);
}
