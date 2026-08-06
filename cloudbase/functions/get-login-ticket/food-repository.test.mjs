import assert from "node:assert/strict";
import test from "node:test";

import {
  FoodRepositoryError,
  clampPage,
  clampPageSize,
  mapFoodRow,
  mapCategoryRow,
  mapTagRow,
  mapImageRow,
  sanitizeFilterTerm,
  createFoodRepository,
} from "./food-repository.cjs";
import { createFoodStorageUrlResolver } from "./food-storage-url-service.cjs";

function mockDb(tables = {}) {
  const calls = [];
  const state = { ...tables };
  function chain(table) {
    let q = {
      _table: table, _filters: [], _or: null, _order: null, _range: null,
      _limit: null, _count: false, _single: false, _maybe: false,
      _conflict: null, _payload: null,
      select(cols, opts) { if (opts?.count) this._count = true; calls.push({ t: "select", table, cols }); return this; },
      eq(col, val) { this._filters.push(["eq", col, val]); return this; },
      in(col, vals) { this._filters.push(["in", col, vals]); return this; },
      gte(col, val) { this._filters.push(["gte", col, val]); return this; },
      lte(col, val) { this._filters.push(["lte", col, val]); return this; },
      ilike(col, val) { this._filters.push(["ilike", col, val]); return this; },
      is(col, val) { this._filters.push(["is", col, val]); return this; },
      or(expr) { this._or = expr; return this; },
      order(col, opts) { this._order = { col, asc: opts?.ascending }; return this; },
      range(a, b) { this._range = [a, b]; calls.push({ t: "range", table, start: a, end: b }); return this; },
      limit(n) { this._limit = n; return this; },
      maybeSingle() { this._maybe = true; return this._resolve(); },
      single() { this._single = true; return this._resolve(); },
      upsert(payload, opts) { this._payload = payload; this._conflict = opts?.onConflict; return this; },
      insert(payload) { this._payload = payload; return this; },
      update(payload) { this._payload = payload; return this; },
      async _resolve() {
        let rows = state[this._table] ? [...state[this._table]] : [];
        for (const [op, col, val] of this._filters) {
          if (op === "eq") rows = rows.filter((r) => col === "is_primary_variant" && r[col] === undefined ? true : r[col] === val);
          if (op === "in") rows = rows.filter((r) => Array.isArray(val) && val.includes(r[col]));
          if (op === "gte") rows = rows.filter((r) => Number(r[col]) >= Number(val));
          if (op === "lte") rows = rows.filter((r) => Number(r[col]) <= Number(val));
          if (op === "is") rows = rows.filter((r) => (val ? r[col] != null : r[col] == null));
          if (op === "ilike") {
            const pat = String(val).replace(/[\*%]/g, "").toLowerCase();
            rows = rows.filter((r) => String(r[col] ?? "").toLowerCase().includes(pat));
          }
        }
        if (this._or) {
          const clauses = this._or.split(",").map((c) => {
            const m = c.match(/^([\p{L}\p{N}_]+)\.ilike\.\*(.*?)\*$/u);
            if (m) return { op: "ilike", col: m[1], val: m[2] };
            const isNull = c.match(/^(\w+)\.is\.null$/);
            if (isNull) return { op: "isNull", col: isNull[1] };
            const gte = c.match(/^(\w+)\.gte\.([^,]+)$/);
            if (gte) return { op: "gte", col: gte[1], val: Number(gte[2]) };
            const lte = c.match(/^(\w+)\.lte\.([^,]+)$/);
            if (lte) return { op: "lte", col: lte[1], val: Number(lte[2]) };
            const inn = c.match(/^(\w+)\.in\.\(([^)]+)\)$/);
            if (inn) return { op: "in", col: inn[1], vals: inn[2].split(",") };
            const equals = c.match(/^(\w+)\.eq\.([^,]+)$/);
            return equals ? { op: "eq", col: equals[1], val: equals[2] } : null;
          }).filter(Boolean);
          rows = rows.filter((r) => clauses.some((c) => {
            if (c.op === "isNull") return r[c.col] == null;
            if (c.op === "eq") return String(r[c.col]) === c.val;
            if (c.op === "gte") return Number(r[c.col]) >= c.val;
            if (c.op === "lte") return Number(r[c.col]) <= c.val;
            if (c.op === "in") return c.vals.includes(String(r[c.col]));
            return String(r[c.col] ?? "").toLowerCase().includes(c.val);
          }));
        }
        if (this._order) rows.sort((a, b) => {
          const av = a[this._order.col], bv = b[this._order.col];
          return this._order.asc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
        });
        if (this._limit) rows = rows.slice(0, this._limit);
        if (this._range) rows = rows.slice(this._range[0], this._range[1] + 1);
        if (this._payload && (this._table === "food_tag_relations" || this._table === "food_images" || this._table === "food_source_payloads" || this._table === "food_sync_jobs")) {
          return { data: this._payload, error: null };
        }
        if (this._payload && (this._table === "foods" || this._table === "app_users")) {
          return { data: { id: "f1", ...this._payload }, error: null };
        }
        if (this._maybe || this._single) return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null, count: rows.length };
      },
      then(resolve, reject) { return this._resolve().then(resolve, reject); },
    };
    return q;
  }
  return {
    from: (table) => { calls.push({ t: "from", table }); return chain(table); },
    _calls: calls, _state: state,
  };
}

test("clampPage/clampPageSize enforce bounds", () => {
  assert.equal(clampPage(0), 1);
  assert.equal(clampPage(5), 5);
  assert.equal(clampPageSize(100), 50);
  assert.equal(clampPageSize(undefined), 20);
});

test("mapFoodRow maps nutrition and flags", () => {
  const f = mapFoodRow({
    id: "f1", source: "usda", source_id: "123", fdc_id: 123,
    calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0,
    is_featured: true, is_verified: false, is_active: true, popularity_score: 2,
  });
  assert.equal(f.nutritionPer100g.protein, 31);
  assert.equal(f.isFeatured, true);
  assert.equal(f.fdcId, 123);
});

test("mapFoodRow maps food group metadata", () => {
  const food = mapFoodRow({
    id: "f1", source: "usda", source_id: "1", normalized_name: "beef",
    calories: 200, protein_g: 20, carbs_g: 0, fat_g: 10,
    food_group_id: "g1", is_primary_variant: false, variant_label_zh: "熟制版本",
  });
  assert.equal(food.foodGroupId, "g1");
  assert.equal(food.isPrimaryVariant, false);
  assert.equal(food.variantLabelZh, "熟制版本");
});

test("mapFoodRow exposes an automatic processing level for flavored drink powder", () => {
  const food = mapFoodRow({ id: "powder", name_zh: "低热量水果味饮料粉", visual_type: null }, {
    category: { code: "fruit", nameZh: "水果" }, tags: [], image: null,
  });
  assert.equal(food.visualType, null);
  assert.equal(food.foodProcessingLevel, "ultra_processed");
});

test("mapFoodRow localizes common variant preparation labels", () => {
  const food = mapFoodRow({ id: "f1", variant_label_zh: "raw" });
  assert.equal(food.variantLabelZh, "生食");
});

test("mapCategoryRow and mapTagRow", () => {
  assert.deepEqual(mapCategoryRow({ id: "c1", code: "meat", name_zh: "肉禽", name_en: "Meat", sort_order: 1, is_active: true }).code, "meat");
  assert.equal(mapTagRow({ id: "t1", code: "high_protein", name_zh: "高蛋白", sort_order: 1, is_active: true }).code, "high_protein");
});

test("mapImageRow prefers stable CDN URLs derived from storage_path", () => {
  const resolver = createFoodStorageUrlResolver({
    baseUrl: "https://cdn.example.test",
  });
  const image = mapImageRow({
    id: "img-1",
    food_id: "food-1",
    storage_path: "food-library/food-1/img-1",
    thumb_url: "https://temporary.example/thumb",
    medium_url: "https://temporary.example/medium",
    detail_url: "https://temporary.example/detail",
    original_url: "https://temporary.example/original",
    source: "hunyuan",
    status: "ready",
    review_status: "approved",
  }, { imageUrlResolver: resolver });
  assert.equal(image.thumbnailUrl, "https://cdn.example.test/food-library/food-1/img-1/thumbnail.webp");
  assert.equal(image.listUrl, "https://cdn.example.test/food-library/food-1/img-1/list.webp");
  assert.equal(image.detailUrl, "https://cdn.example.test/food-library/food-1/img-1/detail.webp");
  assert.equal(image.originalUrl, null);
});

test("listCategories returns active categories sorted", async () => {
  const db = mockDb({ food_categories: [
    { id: "c1", code: "meat", name_zh: "肉禽", name_en: "Meat", sort_order: 1, is_active: true },
    { id: "c2", code: "other", name_zh: "其他", name_en: "Other", sort_order: 12, is_active: true },
    { id: "c3", code: "x", name_zh: "X", sort_order: 5, is_active: false },
  ] });
  const repo = createFoodRepository({ db });
  const cats = await repo.listCategories();
  assert.equal(cats.length, 2);
  assert.equal(cats[0].code, "meat");
});

test("listBatchImageCandidates selects published primary foods from one category so an additional visual state can be generated", async () => {
  const db = mockDb({
    foods: [
      { id: "f-1", name_zh: "番茄", category_id: "c-vegetables", is_active: true, publish_status: "published", is_primary_variant: true, primary_image_id: null },
      { id: "f-2", name_zh: "胡萝卜", category_id: "c-vegetables", is_active: true, publish_status: "published", is_primary_variant: true, primary_image_id: "img-2" },
      { id: "f-3", name_zh: "西兰花", category_id: "c-vegetables", is_active: true, publish_status: "draft", is_primary_variant: true, primary_image_id: null },
      { id: "f-4", name_zh: "鸡蛋", category_id: "c-eggs", is_active: true, publish_status: "published", is_primary_variant: true, primary_image_id: null },
    ],
    food_categories: [
      { id: "c-vegetables", code: "vegetables", name_zh: "蔬菜", is_active: true },
      { id: "c-eggs", code: "eggs", name_zh: "蛋类", is_active: true },
    ],
  });
  const repo = createFoodRepository({ db });

  const result = await repo.listBatchImageCandidates({ categoryId: "c-vegetables", count: 20 });

  assert.deepEqual(result.items.map((item) => item.id), ["f-1", "f-2"]);
  assert.equal(result.total, 2);
});

test("listExistingPrimaryImagesForAudit returns only approved ready primary images with audit metadata", async () => {
  const db = mockDb({
    foods: [
      { id: "f-powder", name_zh: "低热量水果味饮料粉", category_id: "c-drinks", is_active: true, publish_status: "published", is_primary_variant: true },
      { id: "f-wine", name_zh: "仙粉黛红葡萄酒", category_id: "c-drinks", is_active: true, publish_status: "published", is_primary_variant: true },
      { id: "f-draft", name_zh: "草莓味蛋白粉", category_id: "c-drinks", is_active: true, publish_status: "draft", is_primary_variant: true },
      { id: "f-inactive", name_zh: "苹果醋", category_id: "c-drinks", is_active: false, publish_status: "published", is_primary_variant: true },
    ],
    food_categories: [{ id: "c-drinks", code: "beverages", name_zh: "饮品", is_active: true }],
    food_tag_relations: [{ food_id: "f-powder", tag_id: "t-processed" }],
    food_tags: [{ id: "t-processed", code: "processed", name_zh: "加工食品", is_active: true }],
    food_images: [
      { id: "image-approved", food_id: "f-powder", storage_path: "generated/f-powder/image.webp", is_primary: true, status: "ready", review_status: "approved" },
      { id: "image-legacy-approved", food_id: "f-wine", storage_path: "generated/f-wine/image.webp", is_primary: true, status: "ready", review_status: null },
      { id: "image-pending", food_id: "f-powder", is_primary: true, status: "ready", review_status: "pending" },
      { id: "image-empty-review", food_id: "f-powder", is_primary: true, status: "ready", review_status: "" },
      { id: "image-non-primary", food_id: "f-powder", is_primary: false, status: "ready", review_status: "approved" },
      { id: "image-draft", food_id: "f-draft", is_primary: true, status: "ready", review_status: "approved" },
      { id: "image-inactive", food_id: "f-inactive", is_primary: true, status: "ready", review_status: "approved" },
    ],
  });
  const repo = createFoodRepository({ db, imageCdnBaseUrl: "https://images.example" });

  const result = await repo.listExistingPrimaryImagesForAudit({ limit: 999, cursor: "0" });

  assert.deepEqual(result.items.map((item) => item.image.id), ["image-approved", "image-legacy-approved"]);
  assert.equal(result.items[0].food.nameZh, "低热量水果味饮料粉");
  assert.equal(result.items[0].food.category.code, "beverages");
  assert.deepEqual(result.items[0].food.tags.map((tag) => tag.code), ["processed"]);
  assert.equal(result.items[0].image.detailUrl, "https://images.example/generated/f-powder/detail.webp");
  assert.equal(result.nextCursor, null);
  assert.ok(db._calls.some((call) => call.t === "select" && call.table === "food_images"));
  assert.ok(db._calls.some((call) => call.t === "select" && call.table === "foods"));
});

test("listExistingPrimaryImagesForAudit selects the configured current visual profile once per food", async () => {
  const db = mockDb({
    foods: [
      { id: "f-profile", name_zh: "草莓酸奶", category_id: "c-dairy", visual_profile_key: "solid", is_active: true, publish_status: "published" },
      { id: "f-legacy", name_zh: "苹果醋", category_id: "c-condiment", is_active: true, publish_status: "published" },
    ],
    food_categories: [
      { id: "c-dairy", code: "dairy", name_zh: "乳制品", is_active: true },
      { id: "c-condiment", code: "condiments", name_zh: "调味品", is_active: true },
    ],
    food_tag_relations: [],
    food_image_visual_profiles: [
      { id: "profile-standard", food_id: "f-profile", profile_key: "standard", is_default: true },
      { id: "profile-solid", food_id: "f-profile", profile_key: "solid", is_default: false },
    ],
    food_images: [
      { id: "image-stale-standard", food_id: "f-profile", visual_profile_id: "profile-standard", is_primary: true, status: "ready", review_status: "approved" },
      { id: "image-current-solid", food_id: "f-profile", visual_profile_id: "profile-solid", is_primary: true, status: "ready", review_status: "approved" },
      { id: "image-legacy", food_id: "f-legacy", is_primary: true, status: "ready", review_status: null },
    ],
  });
  const repo = createFoodRepository({ db });

  const result = await repo.listExistingPrimaryImagesForAudit({ limit: 20 });

  assert.deepEqual(result.items.map((item) => [item.food.id, item.image.id]), [
    ["f-legacy", "image-legacy"],
    ["f-profile", "image-current-solid"],
  ]);
});

test("listExistingPrimaryImagesForAudit caps at 100 foods and continues from a nonzero cursor", async () => {
  const foods = Array.from({ length: 101 }, (_, index) => {
    const id = `f-${String(index).padStart(3, "0")}`;
    return { id, name_zh: id, category_id: "c-drinks", visual_profile_key: "standard", is_active: true, publish_status: "published" };
  });
  const profiles = foods.map((food) => ({ id: `profile-${food.id}`, food_id: food.id, profile_key: "standard", is_default: true }));
  const images = [
    { id: "image-000-stale", food_id: "f-000", visual_profile_id: "profile-stale", is_primary: true, status: "ready", review_status: "approved" },
    ...foods.map((food) => ({ id: `image-current-${food.id}`, food_id: food.id, visual_profile_id: `profile-${food.id}`, is_primary: true, status: "ready", review_status: "approved" })),
  ];
  const db = mockDb({
    foods,
    food_categories: [{ id: "c-drinks", code: "beverages", name_zh: "饮品", is_active: true }],
    food_tag_relations: [],
    food_image_visual_profiles: profiles,
    food_images: images,
  });
  const repo = createFoodRepository({ db });

  const firstPage = await repo.listExistingPrimaryImagesForAudit({ limit: 999 });
  const secondPage = await repo.listExistingPrimaryImagesForAudit({ limit: 100, cursor: firstPage.nextCursor });

  assert.equal(firstPage.items.length, 100);
  assert.deepEqual(firstPage.items.map((item) => item.food.id), foods.slice(0, 100).map((food) => food.id));
  assert.equal(firstPage.nextCursor, "100");
  assert.deepEqual(secondPage.items.map((item) => item.food.id), ["f-100"]);
  assert.equal(secondPage.nextCursor, null);
  assert.ok(db._calls.some((call) => call.t === "range" && call.table === "foods" && call.start === 0 && call.end === 100));
  assert.ok(db._calls.some((call) => call.t === "range" && call.table === "foods" && call.start === 100 && call.end === 200));
});

test("listBatchImageCandidates expands a selected parent category to all descendant categories", async () => {
  const db = mockDb({
    foods: [
      { id: "f-root", name_zh: "三文鱼罐头", category_id: "c-seafood", is_active: true, publish_status: "published", is_primary_variant: true },
      { id: "f-fish", name_zh: "三文鱼", category_id: "c-marine-fish", is_active: true, publish_status: "published", is_primary_variant: true },
      { id: "f-shrimp", name_zh: "虾", category_id: "c-shrimp-crab", is_active: true, publish_status: "published", is_primary_variant: true },
      { id: "f-other", name_zh: "鸡胸肉", category_id: "c-meat", is_active: true, publish_status: "published", is_primary_variant: true },
    ],
    food_categories: [
      { id: "c-seafood", code: "seafood", name_zh: "鱼虾海鲜", is_active: true },
      { id: "c-marine-fish", code: "seafood.marine_fish", name_zh: "海水鱼", is_active: true },
      { id: "c-shrimp-crab", code: "seafood.shrimp_crab", name_zh: "虾蟹", is_active: true },
      { id: "c-meat", code: "meat_poultry", name_zh: "肉禽", is_active: true },
    ],
    food_image_visual_profiles: [],
    food_images: [],
  });
  const repo = createFoodRepository({ db });

  const result = await repo.listBatchImageCandidates({ categoryId: "c-seafood", count: 20 });

  assert.deepEqual(result.items.map((item) => item.id), ["f-fish", "f-root", "f-shrimp"]);
  assert.equal(result.total, 3);
  assert.equal(result.candidateCount, 3);
});

test("listBatchImageCandidates keeps underscore category codes from matching unrelated codes", async () => {
  const db = mockDb({
    foods: [
      { id: "f-meat", name_zh: "鸡胸肉", category_id: "c-meat", is_active: true, publish_status: "published", is_primary_variant: true },
      { id: "f-child", name_zh: "鸡翅", category_id: "c-meat-child", is_active: true, publish_status: "published", is_primary_variant: true },
      { id: "f-wrong", name_zh: "误匹配", category_id: "c-wrong", is_active: true, publish_status: "published", is_primary_variant: true },
    ],
    food_categories: [
      { id: "c-meat", code: "meat_poultry", name_zh: "肉禽", is_active: true },
      { id: "c-meat-child", code: "meat_poultry.chicken", name_zh: "鸡肉", is_active: true },
      // Would match SQL LIKE meat_poultry% via `_` wildcards, but must not match dotted-tree matching.
      { id: "c-wrong", code: "meatXpoultry", name_zh: "错误分类", is_active: true },
    ],
    food_image_visual_profiles: [],
    food_images: [],
  });
  const repo = createFoodRepository({ db });
  const result = await repo.listBatchImageCandidates({ categoryId: "c-meat", count: 20 });
  assert.deepEqual(result.items.map((item) => item.id).sort(), ["f-child", "f-meat"]);
});

test("listBatchImageCandidates excludes only foods already ready for the requested visual profile", async () => {
  const db = mockDb({
    foods: [
      { id: "f-raw-ready", name_zh: "鸡胸肉", category_id: "c-meat", image_owner_food_id: "f-raw-ready", visual_profile_key: "raw", is_active: true, publish_status: "published", is_primary_variant: true },
      { id: "f-cooked-ready", name_zh: "水煮鸡胸肉", category_id: "c-meat", image_owner_food_id: "f-cooked-ready", visual_profile_key: "cooked_plain", is_active: true, publish_status: "published", is_primary_variant: true },
      { id: "f-cooked-missing", name_zh: "鸡腿肉", category_id: "c-meat", image_owner_food_id: "f-cooked-missing", visual_profile_key: "raw", is_active: true, publish_status: "published", is_primary_variant: true },
    ],
    food_categories: [{ id: "c-meat", code: "meat_poultry", name_zh: "肉禽", is_active: true }],
    food_image_visual_profiles: [
      { id: "profile-raw", food_id: "f-raw-ready", profile_key: "raw", is_default: true },
      { id: "profile-cooked", food_id: "f-cooked-ready", profile_key: "cooked_plain", is_default: true },
      { id: "profile-missing-raw", food_id: "f-cooked-missing", profile_key: "raw", is_default: true },
    ],
    food_images: [
      { id: "image-raw", food_id: "f-raw-ready", visual_profile_id: "profile-raw", is_primary: true, status: "ready", review_status: "approved" },
      { id: "image-cooked", food_id: "f-cooked-ready", visual_profile_id: "profile-cooked", is_primary: true, status: "ready", review_status: "approved" },
    ],
  });
  const repo = createFoodRepository({ db });

  const auto = await repo.listBatchImageCandidates({ categoryId: "c-meat", count: 20, visualProfileKey: "auto" });
  assert.deepEqual(auto.items.map((item) => item.id), ["f-cooked-missing"]);
  assert.equal(auto.total, 1);
  assert.equal(auto.excludedReadyCount, 2);

  const cooked = await repo.listBatchImageCandidates({ categoryId: "c-meat", count: 20, visualProfileKey: "cooked_plain" });
  assert.deepEqual(cooked.items.map((item) => item.id).sort(), ["f-cooked-missing", "f-raw-ready"]);
  assert.equal(cooked.total, 2);
  assert.equal(cooked.excludedReadyCount, 1);
});

test("listFoods applies search filter, pagination, and joins", async () => {
  const db = mockDb({
    foods: [
      { id: "f1", source: "usda", source_id: "1", name_en: "Chicken breast", normalized_name: "chicken breast", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, is_active: true, publish_status: "published", popularity_score: 5, category_id: "c1" },
      { id: "f2", source: "usda", source_id: "2", name_en: "Salmon", normalized_name: "salmon", calories: 206, protein_g: 22, carbs_g: 0, fat_g: 12, is_active: true, publish_status: "published", popularity_score: 3, category_id: "c2" },
    ],
    food_categories: [{ id: "c1", code: "meat", name_zh: "肉禽", name_en: "Meat", sort_order: 1, is_active: true }],
    food_tag_relations: [],
    food_images: [],
  });
  const repo = createFoodRepository({ db });
  const result = await repo.listFoods({ q: "chicken", page: 1, pageSize: 10, sort: "popular" });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].nameEn, "Chicken breast");
  assert.equal(result.pagination.page, 1);
  assert.equal(result.pagination.pageSize, 10);
});

test("listFoods finds a selected suggestion with Chinese variant punctuation", async () => {
  const db = mockDb({
    foods: [
      {
        id: "f-instant-breakfast",
        name_zh: "速溶早餐粉（巧克力味，无糖）",
        normalized_name: "速溶早餐粉",
        calories: 358,
        protein_g: 36,
        carbs_g: 41,
        fat_g: 5,
        is_active: true,
        publish_status: "published",
        is_primary_variant: true,
        popularity_score: 5,
      },
    ],
    food_categories: [],
    food_tag_relations: [],
    food_images: [],
  });
  const repo = createFoodRepository({ db });

  const result = await repo.listFoods({ q: "速溶早餐粉（巧克力味，无糖）", page: 1, pageSize: 10 });

  assert.deepEqual(result.items.map((item) => item.id), ["f-instant-breakfast"]);
});

test("listFoods hides non-primary food variants while retaining ungrouped foods", async () => {
  const db = mockDb({
    foods: [
      { id: "f-primary", name_zh: "牛肉", food_group_id: "g-beef", is_primary_variant: true, calories: 176, protein_g: 21, carbs_g: 0, fat_g: 10, is_active: true, publish_status: "published", popularity_score: 5, category_id: "c1" },
      { id: "f-variant", name_zh: "牛肉", food_group_id: "g-beef", is_primary_variant: false, calories: 291, protein_g: 17, carbs_g: 0, fat_g: 24, is_active: true, publish_status: "published", popularity_score: 4, category_id: "c1" },
      { id: "f-ungrouped", name_zh: "苹果", food_group_id: null, is_primary_variant: true, calories: 52, protein_g: 0, carbs_g: 14, fat_g: 0, is_active: true, publish_status: "published", popularity_score: 3, category_id: "c2" },
    ],
    food_categories: [
      { id: "c1", code: "meat", name_zh: "肉禽", is_active: true },
      { id: "c2", code: "fruits", name_zh: "水果", is_active: true },
    ],
    food_tag_relations: [],
    food_images: [],
  });
  const repo = createFoodRepository({ db });
  const result = await repo.listFoods({ page: 1, pageSize: 20 });
  assert.deepEqual(result.items.map((item) => item.id), ["f-primary", "f-ungrouped"]);
  assert.equal(result.pagination.total, 2);
});

test("listFoodVariants returns all published variants in a food group", async () => {
  const db = mockDb({
    foods: [
      { id: "f-primary", name_zh: "牛肉", food_group_id: "g-beef", is_primary_variant: true, variant_label_zh: null, calories: 176, protein_g: 21, carbs_g: 0, fat_g: 10, is_active: true, publish_status: "published", category_id: "c1" },
      { id: "f-variant", name_zh: "牛肉", food_group_id: "g-beef", is_primary_variant: false, variant_label_zh: "熟制版本", calories: 291, protein_g: 17, carbs_g: 0, fat_g: 24, is_active: true, publish_status: "published", category_id: "c1" },
    ],
    food_categories: [{ id: "c1", code: "meat", name_zh: "肉禽", is_active: true }],
    food_tag_relations: [],
    food_images: [],
  });
  const repo = createFoodRepository({ db });
  const variants = await repo.listFoodVariants("f-primary");
  assert.deepEqual(variants.map((item) => item.id), ["f-primary", "f-variant"]);
  assert.equal(variants[1].variantLabelZh, "熟制版本");
});

test("listFoodVariants resolves one shared image per visual state, not per nutrition row", async () => {
  const db = mockDb({
    foods: [
      { id: "f-primary", name_zh: "鸡胸肉", food_group_id: "g-chicken", image_owner_food_id: "f-primary", visual_profile_key: "raw", is_primary_variant: true, calories: 106, protein_g: 22.5, is_active: true, publish_status: "published", category_id: "c1" },
      { id: "f-cooked", name_zh: "鸡胸肉", food_group_id: "g-chicken", image_owner_food_id: "f-primary", visual_profile_key: "cooked_plain", is_primary_variant: false, variant_label_zh: "熟制", calories: 165, protein_g: 31, is_active: true, publish_status: "published", category_id: "c1" },
    ],
    food_categories: [{ id: "c1", code: "meat", name_zh: "肉禽", is_active: true }],
    food_tag_relations: [],
    food_image_visual_profiles: [
      { id: "profile-raw", food_id: "f-primary", profile_key: "raw", is_default: true },
      { id: "profile-cooked", food_id: "f-primary", profile_key: "cooked_plain", is_default: false },
    ],
    food_images: [
      { id: "image-raw", food_id: "f-primary", visual_profile_id: "profile-raw", is_primary: true, status: "ready", review_status: "approved", medium_url: "https://images.example/raw.webp", detail_url: "https://images.example/raw-detail.webp" },
      { id: "image-cooked", food_id: "f-primary", visual_profile_id: "profile-cooked", is_primary: true, status: "ready", review_status: "approved", medium_url: "https://images.example/cooked.webp", detail_url: "https://images.example/cooked-detail.webp" },
    ],
  });
  const repo = createFoodRepository({ db });

  const variants = await repo.listFoodVariants("f-primary");

  assert.equal(variants[0].image.listUrl, "https://images.example/raw.webp");
  assert.equal(variants[1].image.listUrl, "https://images.example/cooked.webp");
  assert.equal(variants[1].visualProfileKey, "cooked_plain");
});

test("listFoods expands a standard root category to descendant categories", async () => {
  const db = mockDb({
    foods: [
      { id: "f-root", name_en: "Chicken breast", category_id: "c-root", is_active: true, publish_status: "published", popularity_score: 3 },
      { id: "f-leaf", name_en: "Duck breast", category_id: "c-leaf", is_active: true, publish_status: "published", popularity_score: 2 },
      { id: "f-other", name_en: "Apple", category_id: "c-other", is_active: true, publish_status: "published", popularity_score: 1 },
    ],
    food_categories: [
      { id: "c-root", code: "meat_poultry", name_zh: "肉禽", is_active: true },
      { id: "c-leaf", code: "meat_poultry.poultry", name_zh: "禽肉", is_active: true },
      { id: "c-other", code: "fruits", name_zh: "水果", is_active: true },
    ],
    food_tag_relations: [],
    food_images: [],
  });
  const repo = createFoodRepository({ db });
  const result = await repo.listFoods({ categoryCode: "meat_poultry", page: 1, pageSize: 20 });
  assert.deepEqual(result.items.map((item) => item.id), ["f-root", "f-leaf"]);
  assert.equal(result.pagination.total, 2);
});

test("listFoods filters by nutrition tags and multiple category codes", async () => {
  const db = mockDb({
    foods: [
      { id: "f-oat", name_en: "Oats", category_id: "c-grain", is_active: true, publish_status: "published", popularity_score: 3, fiber_g: 10.1, protein_g: 13, carbs_g: 60, fat_g: 7, calories: 380 },
      { id: "f-tofu", name_en: "Tofu", category_id: "c-soy", is_active: true, publish_status: "published", popularity_score: 2, fiber_g: 1, protein_g: 12, carbs_g: 2, fat_g: 6, calories: 120 },
      { id: "f-chicken", name_en: "Chicken", category_id: "c-meat", is_active: true, publish_status: "published", popularity_score: 1, fiber_g: 0, protein_g: 31, carbs_g: 0, fat_g: 3.6, calories: 165 },
    ],
    food_categories: [
      { id: "c-grain", code: "grains_tubers", name_zh: "谷物与薯类", is_active: true },
      { id: "c-soy", code: "plant_protein", name_zh: "豆类与植物蛋白", is_active: true },
      { id: "c-meat", code: "meat_poultry", name_zh: "肉禽", is_active: true },
    ],
    food_tag_relations: [],
    food_images: [],
  });
  const repo = createFoodRepository({ db });
  const byFiber = await repo.listFoods({ tagCodes: ["high_fiber"], page: 1, pageSize: 20 });
  assert.deepEqual(byFiber.items.map((item) => item.id), ["f-oat"]);
  const byPlant = await repo.listFoods({ tagCodes: ["plant_protein"], page: 1, pageSize: 20 });
  assert.deepEqual(byPlant.items.map((item) => item.id).sort(), ["f-oat", "f-tofu"]);
  const multiCategory = await repo.listFoods({ categoryCodes: ["plant_protein", "grains_tubers"], page: 1, pageSize: 20 });
  assert.deepEqual(multiCategory.items.map((item) => item.id).sort(), ["f-oat", "f-tofu"]);
});

test("listFoods resolves regional lenses through memberships without changing the primary category", async () => {
  const db = mockDb({
    foods: [
      { id: "f-salmon", name_en: "Salmon", category_id: "c-seafood", is_active: true, publish_status: "published", popularity_score: 3 },
      { id: "f-beef", name_en: "Beef", category_id: "c-meat", is_active: true, publish_status: "published", popularity_score: 2 },
    ],
    food_region_memberships: [{ food_id: "f-salmon", region_code: "nordic_staples" }],
    food_categories: [{ id: "c-seafood", code: "seafood", name_zh: "鱼虾海鲜", is_active: true }],
    food_tag_relations: [],
    food_images: [],
  });
  const repo = createFoodRepository({ db });
  const result = await repo.listFoods({ categoryCode: "nordic_staples", page: 1, pageSize: 20 });
  assert.deepEqual(result.items.map((item) => item.id), ["f-salmon"]);
  assert.equal(result.items[0].category.code, "seafood");
});

test("getFoodById returns null when missing", async () => {
  const db = mockDb({ foods: [], food_categories: [], food_tag_relations: [], food_images: [] });
  const repo = createFoodRepository({ db });
  assert.equal(await repo.getFoodById("missing"), null);
});

test("suggestions returns up to limit items", async () => {
  const db = mockDb({ foods: [
    { id: "f1", name_zh: "鸡胸肉", name_en: "Chicken breast", normalized_name: "chicken breast", brand_name: null, calories: 165, protein_g: 31, is_primary_variant: true, is_active: true, publish_status: "published", popularity_score: 5 },
  ] });
  const repo = createFoodRepository({ db });
  const s = await repo.suggestions("chicken", 8);
  assert.equal(s.length, 1);
  assert.equal(s[0].nameEn, "Chicken breast");
});

test("sanitizeFilterTerm strips USDA comma lists so PostgREST or-filters stay valid", () => {
  assert.equal(sanitizeFilterTerm("Beef, cured, corned beef, canned"), "beef");
  assert.equal(sanitizeFilterTerm("  Chicken breast  "), "chicken breast");
  assert.equal(sanitizeFilterTerm(""), "");
});

test("suggestions accepts USDA-style comma queries without throwing", async () => {
  const db = mockDb({ foods: [
    { id: "f1", name_zh: null, name_en: "Beef", normalized_name: "beef", brand_name: null, calories: 250, protein_g: 26, is_primary_variant: true, is_active: true, publish_status: "published", popularity_score: 3 },
  ] });
  const repo = createFoodRepository({ db });
  const s = await repo.suggestions("Beef, cured, corned beef, canned", 8);
  assert.equal(s.length, 1);
  assert.equal(s[0].nameEn, "Beef");
});

test("isAdmin reads app_users.is_admin", async () => {
  const db = mockDb({ app_users: [{ id: "u1", is_admin: true }] });
  const repo = createFoodRepository({ db });
  assert.equal(await repo.isAdmin("u1"), true);
});

test("createFoodRepository rejects missing db", () => {
  assert.throws(() => createFoodRepository({}), /RDB client/);
});

test("listFoodsForAdmin resolves regional lenses through memberships", async () => {
  const db = mockDb({
    foods: [
      { id: "f-salmon", name_en: "Salmon", category_id: "c-seafood", is_active: true, publish_status: "published", updated_at: "2026-01-02" },
      { id: "f-beef", name_en: "Beef", category_id: "c-meat", is_active: true, publish_status: "published", updated_at: "2026-01-01" },
    ],
    food_region_memberships: [{ food_id: "f-salmon", region_code: "nordic_staples" }],
    food_categories: [
      { id: "c-seafood", code: "seafood", name_zh: "鱼虾海鲜", is_active: true },
      { id: "c-nordic", code: "nordic_staples", name_zh: "北欧常见食材", is_active: true },
    ],
    food_tag_relations: [],
    food_images: [],
  });
  const repo = createFoodRepository({ db });
  const result = await repo.listFoodsForAdmin({ categoryCode: "nordic_staples", page: 1, pageSize: 20 });
  assert.deepEqual(result.items.map((item) => item.id), ["f-salmon"]);
  assert.equal(result.items[0].category.code, "seafood");
  assert.equal(result.pagination.total, 1);
});
