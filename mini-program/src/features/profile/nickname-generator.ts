// Random Chinese nickname generator for new users.
// Style: 5–6 hanzi, natural / fresh / healthy / warm / light / slightly cute.
// Elements: forest, mountains, plants, fruits, sunshine, clouds, energy,
// food, life, exploration. No numbers, names, regions, years, or system words.

const scenes = [
  "林间", "山野", "森林", "溪畔", "云端", "晨光", "星野", "麦田",
  "果园", "茶园", "山间", "林荫", "花间", "竹林", "松林", "檐下",
  "湖畔", "原野", "谷地", "晨雾",
];

const plants = [
  "青柠", "薄荷", "柚子", "蓝莓", "樱桃", "柠檬", "茉莉", "桂花",
  "茴香", "麦穗", "稻穗", "芦笋", "秋葵", "山茶", "银杏", "枫叶",
  "苔藓", "藤蔓", "白桦", "桑葚",
];

const roles = [
  "漫游者", "轻食客", "补给站", "小行星", "探索家", "收集者",
  "守望者", "漫步者", "记录员", "品鉴官", "慢行者", "寻味人",
  "拾光者", "阅光人", "采风客", "慢食家",
];

const actions = [
  "慢慢走", "慢慢吃", "轻轻走", "慢慢品", "静静听", "慢慢来",
  "慢慢长", "慢慢见", "慢慢记",
];

const adverbs = ["慢慢地", "静静地", "轻轻地", "慢慢儿"];
const verbs = ["变更好", "走很远", "吃好饭", "见晨光", "等花开", "晒太阳"];

type Pattern = { build: () => string };

const patterns: Pattern[] = [
  { build: () => pick(scenes) + pick(roles) }, // 2 + 3 = 5
  { build: () => pick(plants) + pick(roles) }, // 2 + 3 = 5
  { build: () => pick(scenes) + pick(actions) }, // 2 + 3 = 5
  { build: () => pick(plants) + pick(actions) }, // 2 + 3 = 5
  { build: () => pick(adverbs) + pick(verbs) }, // 3 + 3 = 6
];

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function isHanzi(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function isValidNickname(value: string): boolean {
  if (!value) return false;
  const chars = [...value];
  if (chars.length < 5 || chars.length > 6) return false;
  return chars.every(isHanzi);
}

/**
 * Generate a random 5–6 hanzi Chinese nickname.
 * Pass `exclude` to avoid repeating the current nickname.
 */
export function generateNickname(exclude?: string | null): string {
  let attempts = 0;
  while (attempts < 32) {
    const candidate = pick(patterns).build();
    if (isValidNickname(candidate) && candidate !== exclude) {
      return candidate;
    }
    attempts += 1;
  }
  // Deterministic fallback that always satisfies the constraints.
  return "林间慢慢走";
}
