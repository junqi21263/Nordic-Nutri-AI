// Food Image Prompt Engine: determine the edible visual form before looking at
// ingredient/flavour words.  Processed-form rules deliberately outrank fruits,
// vegetables and meats inside every individual source.

const FOOD_VISUAL_TYPES = Object.freeze([
  "raw_meat", "processed_meat", "whole_fish", "fish_fillet", "shellfish", "egg",
  "dairy_liquid", "dairy_solid", "tofu_soy", "grain", "flour_powder", "bread_baked",
  "root_tuber", "leafy_vegetable", "whole_vegetable", "whole_fruit", "cut_fruit",
  "nuts_seeds", "oil_liquid", "condiment_liquid", "sauce_paste", "dry_spice",
  "beverage_liquid", "drink_powder", "coffee_powder", "tea_leaf", "alcohol_bottle",
  "non_alcohol_wine", "canned_food", "packaged_snack", "prepared_dish", "unknown",
]);

const FOOD_VISUAL_TYPE_OPTIONS = Object.freeze({
  raw_meat: "生鲜肉类", processed_meat: "加工肉类", whole_fish: "整鱼", fish_fillet: "鱼片", shellfish: "贝类与甲壳类", egg: "蛋类",
  dairy_liquid: "液态乳制品", dairy_solid: "固态乳制品", tofu_soy: "豆制品", grain: "谷物", flour_powder: "面粉与粉末", bread_baked: "烘焙食品",
  root_tuber: "根茎薯类", leafy_vegetable: "叶菜", whole_vegetable: "普通蔬菜", whole_fruit: "完整水果", cut_fruit: "切开水果",
  nuts_seeds: "坚果与种子", oil_liquid: "食用油", condiment_liquid: "液体调味品", sauce_paste: "酱料", dry_spice: "调味粉",
  beverage_liquid: "液体饮品", drink_powder: "饮料粉", coffee_powder: "咖啡粉", tea_leaf: "茶叶", alcohol_bottle: "酒类瓶装",
  non_alcohol_wine: "无醇酒", canned_food: "罐头食品", packaged_snack: "包装零食", prepared_dish: "熟食", unknown: "未知形态",
});

const PROCESSING_LEVEL_BY_VISUAL_TYPE = Object.freeze({
  raw_meat: "fresh", whole_fish: "fresh", shellfish: "fresh", egg: "fresh", leafy_vegetable: "fresh", whole_vegetable: "fresh", whole_fruit: "fresh", cut_fruit: "fresh",
  grain: "minimally_processed", nuts_seeds: "minimally_processed", tofu_soy: "processed", processed_meat: "processed", dairy_liquid: "processed", dairy_solid: "processed", flour_powder: "processed", bread_baked: "processed", oil_liquid: "processed", condiment_liquid: "processed", sauce_paste: "processed", dry_spice: "processed", beverage_liquid: "processed", drink_powder: "ultra_processed", coffee_powder: "processed", tea_leaf: "minimally_processed", alcohol_bottle: "processed", non_alcohol_wine: "processed", canned_food: "processed", packaged_snack: "ultra_processed", prepared_dish: "processed", unknown: "unknown",
});

const READY_TO_DRINK_TEA_KEYWORDS = Object.freeze([
  "无糖即饮茶", "即饮茶饮料", "调味茶饮料", "果味茶饮料", "乌龙茶饮料", "绿茶饮料", "红茶饮料", "茉莉花茶饮料", "即饮绿茶", "即饮红茶", "即饮乌龙茶", "即饮柠檬茶", "即饮茶", "茶饮料", "瓶装茶", "罐装茶", "柠檬茶", "蜜桃茶", "冰茶", "无糖茶", "低糖茶",
  "ready-to-drink tea", "ready to drink tea", "rtd tea", "bottled tea", "canned tea", "tea beverage", "tea drink", "flavored tea drink", "lemon tea drink", "lemon iced tea", "iced tea", "unsweetened tea", "sugar-free tea", "diet tea drink", "green tea drink", "black tea drink", "oolong tea drink", "jasmine tea drink",
]);
const TEA_LEAF_KEYWORDS = Object.freeze(["散装茶叶", "绿茶茶叶", "红茶茶叶", "乌龙茶叶", "茉莉花茶叶", "普洱茶叶", "茶叶", "tea leaves", "tea leaf", "loose leaf tea", "dried tea leaves"]);
const READY_TO_DRINK_TEA_PATTERNS = Object.freeze([["瓶装茶", /瓶装.*茶/], ["罐装茶", /罐装.*茶/], ["bottled tea", /\bbottled\b.*\btea\b/], ["canned tea", /\bcanned\b.*\btea\b/]]);
const TEA_LEAF_PATTERNS = Object.freeze([["茶叶", /茶叶/], ["tea leaves", /\btea\b.*\bleaves\b/], ["loose leaf tea", /\bloose\s+leaf\b.*\btea\b/], ["dried tea leaves", /\bdried\b.*\btea\b.*\bleaves\b/]]);
const DRINK_POWDER_PATTERNS = Object.freeze([["风味饮品粉", /(?:水果?|柠檬|橙子?|葡萄|草莓|芒果|莓果).{0,6}(?:饮料|饮品|果汁|冲饮|水)粉/]]);
const FRUIT_FLAVOR_KEYWORDS = Object.freeze(["水果", "橙", "橙子", "苹果", "葡萄", "草莓", "柠檬", "芒果", "莓果", "fruit", "orange", "apple", "grape", "strawberry", "lemon", "mango", "berry"]);

// Higher priority wins after keyword length. Keep processed form words above
// ingredient names, then sort by the literal keyword length for long-word-first.
const RULES = Object.freeze([
  ["non_alcohol_wine", 100, ["alcohol-free sparkling wine", "无酒精葡萄酒", "无醇葡萄酒", "脱醇葡萄酒", "无醇起泡酒", "alcohol-free wine", "non-alcoholic wine", "dealcoholized wine"]],
  ["drink_powder", 98, ["breakfast drink powder", "lemonade powder", "juice powder", "运动饮料粉", "meal replacement powder", "nutrition powder", "electrolyte powder", "低热量水果味饮料粉", "早餐饮料粉", "固体饮料", "冲调粉", "冲泡粉", "果汁粉", "饮品粉", "果味粉", "电解质粉", "饮料粉", "代餐粉", "营养粉", "蛋白粉", "增肌粉", "protein powder", "drink powder", "drink mix", "beverage powder"]],
  ["alcohol_bottle", 97, ["sparkling wine", "red wine", "white wine", "红葡萄酒", "白葡萄酒", "葡萄酒", "起泡酒", "威士忌", "伏特加", "朗姆酒", "香槟", "啤酒", "红酒", "白酒", "清酒", "champagne", "whisky", "whiskey", "vodka", "rum", "sake", "wine", "beer"]],
  ["coffee_powder", 96, ["instant coffee powder", "coffee powder", "ground coffee", "速溶咖啡粉", "研磨咖啡", "咖啡粉"]],
  ["condiment_liquid", 95, ["apple cider vinegar", "cooking wine", "fish sauce", "rice vinegar", "soy sauce", "苹果醋", "米醋", "陈醋", "酱油", "生抽", "老抽", "鱼露", "料酒", "vinegar"]],
  ["sauce_paste", 94, ["peanut butter", "sesame paste", "mayonnaise", "番茄酱", "花生酱", "芝麻酱", "沙拉酱", "豆瓣酱", "蛋黄酱", "果酱", "酱料", "味噌", "sauce", "paste", "ketchup", "miso", "jam", "酱", "泥", "糊"]],
  ["dry_spice", 93, ["cinnamon powder", "onion powder", "garlic powder", "pepper powder", "chili powder", "spice powder", "curry powder", "cumin powder", "胡椒粉", "辣椒粉", "孜然粉", "五香粉", "蒜粉", "洋葱粉", "肉桂粉", "咖喱粉", "调味粉"]],
  ["flour_powder", 92, ["tapioca starch", "wheat flour", "oat flour", "rice flour", "corn flour", "低筋面粉", "中筋面粉", "高筋面粉", "全麦面粉", "燕麦粉", "玉米粉", "木薯粉", "面粉", "淀粉", "flour", "starch"]],
  ["beverage_liquid", 91, [...READY_TO_DRINK_TEA_KEYWORDS, "lemonade concentrate", "beverage concentrate", "drink concentrate", "juice concentrate", "energy drink", "sports drink", "coffee drink", "soy milk", "oat milk", "饮料浓缩液", "果汁浓缩液", "浓缩果汁", "浓缩液", "果汁", "牛奶", "豆奶", "燕麦奶", "汽水", "可乐", "苏打水", "茶饮", "咖啡饮料", "能量饮料", "运动饮料", "juice", "milk", "soda", "cola"]],
  ["canned_food", 90, ["罐头", "canned"]], ["packaged_snack", 89, ["包装零食", "薯片", "饼干", "糖果", "snack", "chips", "cookie"]],
  ["processed_meat", 88, ["香肠", "火腿", "培根", "腊肉", "肉肠", "sausage", "ham", "bacon"]], ["bread_baked", 87, ["面包", "蛋糕", "贝果", "吐司", "bread", "cake", "bagel", "toast"]],
  ["prepared_dish", 86, ["炒饭", "意面", "沙拉", "炖菜", "汤", "菜肴", "prepared dish", "cooked dish"]],
  ["shellfish", 70, ["龙虾", "牡蛎", "生蚝", "扇贝", "贻贝", "海螺", "田螺", "鲍鱼", "虾", "蟹", "clam", "oyster", "mussel", "scallop", "conch", "abalone", "shrimp", "crab", "lobster"]],
  ["fish_fillet", 69, ["鱼片", "fillet"]], ["whole_fish", 68, ["整鱼", "鲜鱼", "fish"]], ["raw_meat", 67, ["鸡胸肉", "牛肉", "猪肉", "羊肉", "肉禽", "chicken", "beef", "pork", "lamb"]],
  ["dairy_solid", 66, ["奶酪", "黄油", "酸奶", "cheese", "butter", "yogurt", "yoghurt"]], ["dairy_liquid", 65, ["乳制品", "milk"]], ["tofu_soy", 64, ["豆腐", "豆干", "豆制品", "tofu", "tempeh"]],
  ["tea_leaf", 92, TEA_LEAF_KEYWORDS], ["oil_liquid", 62, ["橄榄油", "菜籽油", "芝麻油", "食用油", "oil"]], ["grain", 61, ["燕麦", "藜麦", "荞麦", "谷物", "grain", "oats", "quinoa"]],
  ["root_tuber", 40, ["土豆", "红薯", "山药", "胡萝卜", "根茎", "potato", "sweet potato"]], ["leafy_vegetable", 39, ["菠菜", "生菜", "叶菜", "白菜", "kale", "lettuce", "spinach"]], ["whole_vegetable", 38, ["番茄", "西兰花", "洋葱", "蔬菜", "vegetable", "broccoli", "tomato"]],
  ["cut_fruit", 37, ["果切", "切片水果", "cut fruit"]], ["whole_fruit", 36, ["苹果", "橙子", "橙", "葡萄", "草莓", "柠檬", "芒果", "水果", "fruit", "orange", "apple", "grape", "strawberry", "lemon", "mango", "berry"]], ["egg", 35, ["鸡蛋", "鸭蛋", "鹌鹑蛋", "egg"]], ["nuts_seeds", 34, ["坚果", "杏仁", "核桃", "花生", "腰果", "种子", "nut", "seed"]],
]);

function clean(value) { return String(value ?? "").trim().toLowerCase(); }
function normalizeMatchText(value) { return clean(value).replace(/[\u2010-\u2015_\-/.,;:()[\]{}]+/g, " ").replace(/\s+/g, " ").trim(); }
function foodValue(food, ...keys) { for (const key of keys) if (food?.[key] != null) return food[key]; return ""; }
function tagText(tags) { return (Array.isArray(tags) ? tags : []).map((tag) => [tag?.code, tag?.nameZh, tag?.nameEn, typeof tag === "string" ? tag : ""].filter(Boolean).join(" ")).join(" "); }
function hasVisualType(value) { return FOOD_VISUAL_TYPES.includes(String(value || "").trim()); }

function findRule(text, source = "") {
  const evidence = normalizeMatchText(text);
  if (!evidence) return null;
  const candidates = [];
  for (let order = 0; order < RULES.length; order += 1) {
    const [visualType, priority, keywords] = RULES[order];
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeMatchText(keyword);
      if (normalizedKeyword && evidence.includes(normalizedKeyword)) candidates.push({ visualType, keyword, priority, order, source });
    }
  }
  for (const [keyword, pattern] of READY_TO_DRINK_TEA_PATTERNS) {
    if (pattern.test(evidence)) candidates.push({ visualType: "beverage_liquid", keyword, priority: 91, order: 8, source });
  }
  for (const [keyword, pattern] of TEA_LEAF_PATTERNS) {
    if (pattern.test(evidence)) candidates.push({ visualType: "tea_leaf", keyword, priority: 92, order: 15, source });
  }
  for (const [keyword, pattern] of DRINK_POWDER_PATTERNS) {
    if (pattern.test(evidence)) candidates.push({ visualType: "drink_powder", keyword, priority: 98, order: 1, source });
  }
  candidates.sort((a, b) => b.priority - a.priority || normalizeMatchText(b.keyword).length - normalizeMatchText(a.keyword).length || a.order - b.order);
  if (!candidates.length) return null;
  return { candidates };
}

function resolveBeverageSubtype(text) {
  const evidence = normalizeMatchText(text);
  const matchedKeywords = [
    ...READY_TO_DRINK_TEA_KEYWORDS.filter((keyword) => evidence.includes(normalizeMatchText(keyword))),
    ...READY_TO_DRINK_TEA_PATTERNS.filter(([, pattern]) => pattern.test(evidence)).map(([keyword]) => keyword),
  ];
  return matchedKeywords.length ? { beverageSubtype: "ready_to_drink_tea", matchedKeywords: [...new Set(matchedKeywords)] } : { beverageSubtype: null, matchedKeywords: [] };
}

function resolveFlavor(food = {}) {
  const evidence = normalizeMatchText([foodValue(food, "nameZh", "foodNameZh", "name_zh"), foodValue(food, "nameEn", "foodNameEn", "name_en")].join(" "));
  const rules = [["柠檬味", ["柠檬味", "lemon"]], ["橙味", ["橙味", "orange"]], ["草莓味", ["草莓味", "strawberry"]], ["葡萄味", ["葡萄味", "grape"]], ["莓果味", ["莓果味", "berry"]], ["水果味", ["水果味", "fruit flavored"]], ["蜜桃味", ["蜜桃味", "peach"]], ["芒果味", ["芒果味", "mango"]], ["香草味", ["香草味", "vanilla"]], ["巧克力味", ["巧克力味", "chocolate"]], ["咖啡味", ["咖啡味", "coffee"]], ["抹茶味", ["抹茶味", "matcha"]]];
  for (const [flavor, keywords] of rules) {
    const matchedKeywords = keywords.filter((keyword) => evidence.includes(normalizeMatchText(keyword)));
    if (matchedKeywords.length) return { flavor, matchedKeywords };
  }
  return { flavor: null, matchedKeywords: [] };
}

function matchCandidates(candidates) {
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.priority - a.priority || normalizeMatchText(b.keyword).length - normalizeMatchText(a.keyword).length || a.order - b.order);
  const winner = candidates[0];
  const ignored = candidates.filter((candidate) => candidate.visualType !== winner.visualType && candidate.priority < winner.priority);
  const subtype = winner.visualType === "beverage_liquid" ? resolveBeverageSubtype(candidates.map((candidate) => candidate.keyword).join(" ")) : { beverageSubtype: null, matchedKeywords: [] };
  return {
    visualType: winner.visualType,
    matchedKeywords: [...new Set(candidates.filter((candidate) => candidate.visualType === winner.visualType).map((candidate) => candidate.keyword))],
    source: winner.source,
    rulePriority: winner.priority,
    beverageSubtype: subtype.beverageSubtype,
    ignoredKeywords: [...new Set(ignored.filter((candidate) => FRUIT_FLAVOR_KEYWORDS.includes(candidate.keyword)).map((candidate) => candidate.keyword))],
    excludedVisualTypes: [...new Set(ignored.map((candidate) => candidate.visualType))],
  };
}

function resolveFoodVisualType(food = {}) {
  const manual = foodValue(food, "visualType", "visual_type");
  if (hasVisualType(manual) && manual !== "unknown") return { visualType: manual, matchedKeywords: [manual], source: "manual", rulePriority: 10000, beverageSubtype: manual === "beverage_liquid" ? resolveBeverageSubtype([foodValue(food, "nameZh", "foodNameZh"), foodValue(food, "nameEn", "foodNameEn")].join(" ")).beverageSubtype : null, ignoredKeywords: [], excludedVisualTypes: [] };
  // Controlled tags may use the visual-type code directly.  This is the
  // strongest automatic signal and still remains below an explicit override.
  for (const tag of Array.isArray(food.tags) ? food.tags : []) {
    const code = clean(typeof tag === "string" ? tag : tag?.code);
    if (hasVisualType(code) && code !== "unknown") return { visualType: code, matchedKeywords: [code], source: "tags", rulePriority: 9999, beverageSubtype: null, ignoredKeywords: [], excludedVisualTypes: [] };
  }
  const tagMatch = findRule(tagText(food.tags), "tags");
  if (tagMatch) return matchCandidates(tagMatch.candidates);
  const nameMatches = [
    findRule(foodValue(food, "nameZh", "foodNameZh", "name_zh"), "nameZh"),
    findRule(foodValue(food, "nameEn", "foodNameEn", "name_en"), "nameEn"),
  ].flatMap((match) => match?.candidates || []);
  const nameResult = matchCandidates(nameMatches);
  if (nameResult) {
    const subtype = nameResult.visualType === "beverage_liquid" ? resolveBeverageSubtype([foodValue(food, "nameZh", "foodNameZh", "name_zh"), foodValue(food, "nameEn", "foodNameEn", "name_en")].join(" ")) : null;
    return { ...nameResult, beverageSubtype: subtype?.beverageSubtype || nameResult.beverageSubtype, matchedKeywords: [...new Set([...nameResult.matchedKeywords, ...(subtype?.matchedKeywords || [])])] };
  }
  const categoryMatch = findRule([food.category?.code, food.category?.nameZh, food.category?.nameEn, foodValue(food, "category", "categoryCode")].filter(Boolean).join(" "), "category");
  if (categoryMatch) return matchCandidates(categoryMatch.candidates);
  return { visualType: "unknown", matchedKeywords: [], source: "fallback", rulePriority: 0, beverageSubtype: null, ignoredKeywords: [], excludedVisualTypes: [] };
}

function resolveFlavorColor(food = {}) {
  const evidence = clean([foodValue(food, "nameZh", "foodNameZh"), foodValue(food, "nameEn", "foodNameEn")].join(" "));
  const rules = [["orange", "浅橙黄色", ["橙味", "orange"]], ["lemon", "浅金黄色或淡琥珀色", ["柠檬味", "lemon"]], ["strawberry", "淡粉色", ["草莓味", "strawberry"]], ["grape", "低饱和淡紫色", ["葡萄味", "grape"]], ["berry", "淡紫红色", ["莓果味", "berry"]], ["fruit", "浅黄色或浅橙色", ["水果味", "fruit flavored", "fruit-flavored"]], ["chocolate", "浅棕色", ["巧克力味", "chocolate"]], ["vanilla", "奶白色", ["香草味", "vanilla"]], ["matcha", "浅绿色", ["抹茶味", "matcha"]], ["coffee", "棕色", ["咖啡味", "coffee"]]];
  for (const [, color, keywords] of rules) if (keywords.some((keyword) => evidence.includes(keyword))) return color;
  if (/原味.*蛋白粉|protein powder/.test(evidence)) return "奶白色或浅米黄色";
  return null;
}

const COMMON_NEGATIVE = "人物、人手、文字、水印、品牌Logo、包装文字、插画、卡通、动漫、3D、CG、塑料玩具质感、错误食物、多个主体、杂乱背景、过度摆盘、过度装饰、餐厅广告风";
const PROCESSED_TYPES = new Set(["drink_powder", "coffee_powder", "flour_powder", "dry_spice", "beverage_liquid", "alcohol_bottle", "non_alcohol_wine", "condiment_liquid", "sauce_paste", "canned_food", "packaged_snack", "prepared_dish", "dairy_liquid", "dairy_solid"]);
const TYPE_DETAILS = Object.freeze({
  raw_meat: ["生鲜未烹调肉类，真实肉色、脂肪纹理、肌理与自然湿润切面", "煎烤炸炖煮、酱汁、香草、柠檬、蔬菜、薯条、完整餐盘"],
  processed_meat: ["加工肉制品最终可食用形态，准确表现切片、外皮、纹理与色泽", "生肉原料、三明治、披萨、套餐"],
  whole_fish: ["完整生鲜鱼类，保留真实鱼鳞、鱼皮、鱼鳍、体型与湿润质感", "烹饪、柠檬、酱汁、寿司、其他海鲜"],
  fish_fillet: ["生鲜未烹调鱼片，真实鱼肉色泽、脂肪纹理与湿润切面", "完整鱼、寿司、刺身拼盘、煎鱼、烤鱼、炸鱼、柠檬、酱汁"],
  shellfish: ["贝类或甲壳类海鲜本体，真实外壳、颜色、形态与生鲜质感", "烹饪、酱汁、柠檬、意面、米饭、海鲜拼盘"],
  egg: ["蛋类本体；未说明熟制时展示完整带壳生蛋", "煎蛋、炒蛋、早餐套餐、烘焙食品"],
  dairy_liquid: ["液态乳制品，使用简洁透明玻璃杯或无品牌容器，表现液体颜色与顺滑质感", "奶牛、奶粉、奶酪、完整早餐场景"],
  dairy_solid: ["固态乳制品本体，准确表现块状、片状、凝固状态、孔洞与纹理", "牛奶杯、奶牛、披萨、完整餐食"],
  tofu_soy: ["豆制品最终可食用形态，准确表现豆腐、豆干或植物蛋白的真实纹理", "完整黄豆植株、完整菜肴"],
  grain: ["谷物颗粒本体，浅色陶瓷碗或木勺盛放，颗粒与干燥质感清晰", "面包、粥、米饭、蛋糕、农田"],
  flour_powder: ["粉末状基础食材，浅色陶瓷小碗盛放自然堆起的粉末，旁有浅木勺少量粉末", "完整谷物主体、麦穗、面包、蛋糕、面条、熟食"],
  bread_baked: ["烘焙食品最终可食用成品，真实外壳、内部组织、切面与烘焙色泽", "奶油装饰、水果、饮品、完整早餐场景"],
  root_tuber: ["新鲜根茎薯类本体，真实表皮、切面与自然纹理", "完整菜肴、酱料、罐头"], leafy_vegetable: ["新鲜叶菜本体，真实叶片、叶脉、根部与自然色泽", "沙拉、汤、炒菜、腌菜、熟食"], whole_vegetable: ["新鲜蔬菜本体，真实表皮、茎叶、根部、切面与自然纹理", "沙拉、汤、炒菜、酱料、罐头"],
  whole_fruit: ["真实完整水果，保留自然大小、形状、表皮、色泽与纹理，可有一个自然切面", "果汁、果酱、沙拉、甜品、罐头、包装食品"], cut_fruit: ["真实新鲜切开水果，果肉与切面清楚可辨", "果汁、果酱、沙拉、甜品、包装食品"],
  nuts_seeds: ["坚果或种子本体，浅色小碗或木勺自然盛放，真实外壳、颗粒、色泽与纹理", "坚果酱、植物奶、蛋糕、混合零食"], oil_liquid: ["液态食用油脂，无品牌透明小玻璃瓶或玻璃碗盛放，表现油脂颜色、透明度与流动质感", "油料作物、果实、完整菜肴"],
  condiment_liquid: ["液体调味品，无品牌小玻璃瓶、调味壶或浅色小碗盛放，表现颜色、透明度、浓度与液体质感", "完整水果、完整蔬菜、原材料主体、完整菜肴"], sauce_paste: ["酱料、酱泥或糊状食品，浅色小陶瓷碗盛放并配小木勺，表现浓稠度、颗粒、颜色与自然光泽", "原材料主体、完整菜肴"], dry_spice: ["干燥调味粉、香料粉或香料颗粒，浅色小陶瓷碗或木勺盛放，真实颜色与干燥质感", "原材料植物主体、完整菜肴"],
  beverage_liquid: ["已完成的液体饮品，简洁透明玻璃杯或无品牌瓶装容器盛放，表现真实颜色、透明度与浓度", "原材料水果、植物、谷物、粉末、大量水果装饰"],
  drink_powder: ["冲泡型饮料粉、固体饮料粉、营养粉、蛋白粉或代餐粉本身；浅色陶瓷或透明小玻璃碗盛放细腻粉末，旁有浅木勺与极少量自然散粉", "完整水果、切开水果、水果拼盘、果树、果叶、果枝、果皮、果肉切面、果汁、饮料杯、吸管、冰块、已冲泡液体、包装袋、包装罐"],
  coffee_powder: ["咖啡粉本身，浅色陶瓷小碗盛放细腻深棕色咖啡粉，旁有浅木勺少量粉末", "咖啡杯、拉花、已冲泡咖啡、咖啡豆主体、咖啡包装"], tea_leaf: ["干燥茶叶本体，浅色陶瓷小碟或木勺自然盛放，叶片形态、卷曲与干燥质感清楚", "茶杯、茶汤、茶壶、茶园"],
  alcohol_bottle: ["瓶装酒精饮品；一瓶关闭的真实玻璃酒瓶，瓶身轮廓、瓶塞或瓶盖与瓶内液体清晰，使用无品牌无文字的极简空白标签，不开瓶不倒酒不搭配酒杯", "苹果、葡萄、葡萄串、水果主体、水果拼盘、葡萄藤、树叶、果枝、酒杯、倒酒、木桶、酒庄、餐食、甜点"],
  non_alcohol_wine: ["无醇或脱醇瓶装饮品；一瓶关闭的真实玻璃饮料瓶，类似葡萄酒瓶型与液体颜色，使用无品牌无文字空白标签，不搭配酒杯", "水果主体、葡萄、酒杯、倒酒、品牌文字"], canned_food: ["罐头食品的实际可食用内容物，优先浅色小碗盛放食品本体", "品牌罐头包装、可识别文字、未经加工原材料主体"], packaged_snack: ["拆除包装后的零食实际可食用成品", "品牌包装、可识别文字、原始原材料"], prepared_dish: ["熟食或菜肴最终可食用形态，简洁浅色餐盘或小碗盛放，真实烹饪方式、色泽、质感和主要组成", "名称中不存在的配菜、酱汁、装饰"],
  unknown: ["单一可食用食物主体，形态准确、清楚可辨", "其他食物、包装、水印、插画、3D"],
});

function buildBasePhotographyPrompt() { return "真实可食用健康食物摄影。自然真实，不夸张，不做商业广告式过度修饰。北欧自然光，柔和侧光。浅米白或暖白桌面。浅木色餐具或道具。低饱和、干净、克制。主体居中。构图简洁。轻微景深虚化。4:3横构图。仅展示与该食品直接相关的主体。无人手。无人物。无文字。无水印。无品牌Logo。无插画。无卡通。无3D。无CG。无塑料玩具质感"; }

function buildPromptByVisualType(food = {}, visualType = "unknown") {
  const type = hasVisualType(visualType) ? visualType : "unknown";
  const beverageSubtype = type === "beverage_liquid" ? resolveBeverageSubtype([foodValue(food, "nameZh", "foodNameZh", "name_zh"), foodValue(food, "nameEn", "foodNameEn", "name_en")].join(" ")).beverageSubtype : null;
  const [defaultSubject, defaultNegative] = TYPE_DETAILS[type] || TYPE_DETAILS.unknown;
  const isReadyToDrinkTea = beverageSubtype === "ready_to_drink_tea";
  const subject = isReadyToDrinkTea
    ? "真实茶饮液体；透明玻璃杯或无品牌透明瓶盛放。柠檬仅表示浅金或淡琥珀色风味，不是主体。禁止完整水果、干燥茶叶主体、茶园、粉末、品牌包装"
    : defaultSubject;
  const typeNegative = isReadyToDrinkTea
    ? "完整柠檬、切开的柠檬主体、完整水果、水果拼盘、果树、树枝、果叶、干燥茶叶主体、茶叶堆、茶园、茶树、饮料粉、粉末、品牌包装、包装文字、吸管、大量冰块、鸡尾酒、甜点"
    : defaultNegative;
  const flavorColor = resolveFlavorColor(food);
  const antiAmbiguity = PROCESSED_TYPES.has(type) ? "必须优先理解完整食品名称，不得将名称拆分后只生成其中的水果、蔬菜、肉类、谷物、豆类或其他原材料；风味词只决定颜色和口味语义，不代表画面主体" : "";
  const color = flavorColor && ["drink_powder", "beverage_liquid", "dairy_liquid"].includes(type) ? `风味颜色：${flavorColor}` : "";
  const nameZh = foodValue(food, "nameZh", "foodNameZh", "name_zh") || "食物";
  const nameEn = foodValue(food, "nameEn", "foodNameEn", "name_en");
  return { templateName: isReadyToDrinkTea ? "Ready-to-Drink Tea Template" : `${FOOD_VISUAL_TYPE_OPTIONS[type]}模板`, beverageSubtype, subject: `主体：${nameZh}${nameEn ? `；英文：${nameEn}` : ""}。${subject}${color ? `。风味颜色：${flavorColor}` : ""}${antiAmbiguity ? `。${antiAmbiguity}` : ""}`, negativePrompt: [isReadyToDrinkTea ? typeNegative : COMMON_NEGATIVE, isReadyToDrinkTea ? COMMON_NEGATIVE : typeNegative].filter(Boolean).join("、"), flavorColor };
}

function resolveFoodProcessingLevel(food = {}) { return PROCESSING_LEVEL_BY_VISUAL_TYPE[resolveFoodVisualType(food).visualType] || "unknown"; }
function resolveFoodProcessingLabel(food = {}) { const resolution = resolveFoodVisualType(food); return resolution.beverageSubtype === "ready_to_drink_tea" ? "即饮饮品" : ({ fresh: "新鲜食材", minimally_processed: "轻度加工食材", processed: "加工食品", ultra_processed: "超加工食品", unknown: "未知" })[PROCESSING_LEVEL_BY_VISUAL_TYPE[resolution.visualType] || "unknown"]; }

module.exports = { FOOD_VISUAL_TYPES, FOOD_VISUAL_TYPE_OPTIONS, PROCESSING_LEVEL_BY_VISUAL_TYPE, resolveFoodVisualType, resolveFlavor, resolveFlavorColor, resolveFoodProcessingLevel, resolveFoodProcessingLabel, buildBasePhotographyPrompt, buildPromptByVisualType };
