const feedbackTypes = new Set([
  "wrong_food",
  "missing_food",
  "extra_food",
  "portion_inaccurate",
  "nutrition_data",
  "other",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INPUT_BYTES = 16 * 1024;
const MAX_SNAPSHOT_BYTES = 10 * 1024;

class PublicRecognitionFeedbackError extends Error {
  constructor(code = "RECOGNITION_FEEDBACK_INVALID", message = "识别反馈无效") {
    super(message);
    this.code = code;
  }
}

function invalid(message = "识别反馈无效") {
  return new PublicRecognitionFeedbackError("RECOGNITION_FEEDBACK_INVALID", message);
}

function optionalUuid(value, field) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !uuidPattern.test(value)) throw invalid(`${field}无效`);
  return value;
}

function boundedString(value, max, field, { required = false } = {}) {
  if (value == null) {
    if (required) throw invalid(`${field}无效`);
    return null;
  }
  if (typeof value !== "string") throw invalid(`${field}无效`);
  const text = value.trim();
  if (required && !text) throw invalid(`${field}无效`);
  if (text.length > max) throw invalid(`${field}过长`);
  return text || null;
}

function boundedNumber(value) {
  return Number.isFinite(value) && value >= 0 && value <= 2000 ? value : null;
}

function normalizeSnapshot(input, note = null) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const items = Array.isArray(source.items)
    ? source.items.slice(0, 20).map((item) => ({
      id: boundedString(item?.id, 100, "食物项 ID"),
      name: boundedString(item?.name, 100, "食物名称", { required: true }),
      quantityG: boundedNumber(item?.quantityG),
      amount: boundedString(item?.amount, 40, "食物份量"),
      calories: boundedNumber(item?.calories),
      protein: boundedNumber(item?.protein),
      carbs: boundedNumber(item?.carbs),
      fat: boundedNumber(item?.fat),
      foodId: boundedString(item?.foodId, 100, "食物 ID"),
    }))
    : [];
  const snapshot = {
    mealType: boundedString(source.mealType, 20, "餐次"),
    title: boundedString(source.title, 120, "餐食名称"),
    items,
  };
  const normalizedNote = boundedString(note, 500, "备注");
  if (normalizedNote) snapshot.note = normalizedNote;
  if (Buffer.byteLength(JSON.stringify(snapshot), "utf8") > MAX_SNAPSHOT_BYTES) throw invalid("识别结果过大");
  return snapshot;
}

function assertInputSize(input) {
  if (Buffer.byteLength(JSON.stringify(input ?? {}), "utf8") > MAX_INPUT_BYTES) throw invalid("识别反馈请求过大");
}

function normalizeCreateInput(input) {
  assertInputSize(input);
  if (!feedbackTypes.has(input?.feedbackType)) throw invalid("反馈类型无效");
  return {
    analysisId: optionalUuid(input?.analysisId, "分析 ID"),
    feedbackType: input.feedbackType,
    originalResult: normalizeSnapshot(input?.originalResult, input?.note),
  };
}

function normalizeUpdateInput(input) {
  assertInputSize(input);
  const hasMealId = Object.prototype.hasOwnProperty.call(input ?? {}, "mealId");
  const hasCorrection = Object.prototype.hasOwnProperty.call(input ?? {}, "correctedResult");
  const hasNote = Object.prototype.hasOwnProperty.call(input ?? {}, "note");
  if (!hasMealId && !hasCorrection && !hasNote) throw invalid("缺少纠正结果");
  return {
    mealId: hasMealId ? optionalUuid(input?.mealId, "餐记录 ID") : undefined,
    correctedResult: hasCorrection ? normalizeSnapshot(input?.correctedResult) : undefined,
    note: hasNote ? boundedString(input?.note, 500, "备注") : undefined,
  };
}

async function ownedRow(db, table, id, userId, fields, label) {
  const result = await db.from(table)
    .select(fields)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) throw new Error(`${label} read failed`);
  if (!result.data) throw invalid(`${label}不存在`);
  return result.data;
}

function analysisSnapshot(analysis, fallback) {
  const normalizedItems = Array.isArray(analysis?.normalized_items) ? analysis.normalized_items : [];
  const hasFeedbackSnapshotShape = normalizedItems.length > 0 && normalizedItems.every((item) =>
    typeof item?.name === "string" &&
    Number.isFinite(item?.calories) &&
    Number.isFinite(item?.protein) &&
    Number.isFinite(item?.carbs) &&
    Number.isFinite(item?.fat));
  return normalizeSnapshot({
    mealType: analysis?.meal_type ?? fallback.mealType,
    title: fallback.title,
    items: hasFeedbackSnapshotShape ? normalizedItems : fallback.items,
  });
}

const reasonLabels = {
  wrong_food: "食物识别错了",
  missing_food: "少识别了食物",
  extra_food: "多识别了食物",
  portion_inaccurate: "份量不准确",
  nutrition_data: "营养数据看起来不对",
  other: "其他",
};

function feedbackContent(row) {
  const original = row.original_result || {};
  const corrected = row.corrected_result || {};
  const items = Array.isArray(corrected.items) ? corrected.items : [];
  const note = typeof corrected.note === "string" ? corrected.note.trim() : "";
  return [
    `识别纠错 · ${reasonLabels[row.feedback_type] || "识别问题"} · ${original.title || "这餐"}`,
    items.length ? `修正后：${items.map((item) => `${item.name}${Number.isFinite(item.quantityG) ? ` ${item.quantityG}g` : ""}`).join("、")}` : "",
    note ? `备注：${note}` : "",
  ].filter(Boolean).join("\n").slice(0, 2000);
}

function createRecognitionFeedbackDataService({ db }) {
  if (!db || typeof db.from !== "function") throw new Error("Recognition feedback database is unavailable");

  return {
    async createFeedback(userId, input) {
      const normalized = normalizeCreateInput(input);
      let metadata = { model: null, imageSha256: null };
      let originalResult = normalized.originalResult;
      if (normalized.analysisId) {
        const analysis = await ownedRow(
          db,
          "ai_analysis",
          normalized.analysisId,
          userId,
          "id,user_id,provider,model,image_sha256,normalized_items",
          "分析记录",
        );
        metadata = {
          model: boundedString(analysis.model, 120, "模型"),
          imageSha256: typeof analysis.image_sha256 === "string" && /^[0-9a-f]{64}$/i.test(analysis.image_sha256)
            ? analysis.image_sha256.toLowerCase()
            : null,
        };
        originalResult = analysisSnapshot(analysis, normalized.originalResult);
      }
      const result = await db.from("recognition_feedback").insert({
        user_id: userId,
        meal_id: null,
        analysis_id: normalized.analysisId,
        feedback_type: normalized.feedbackType,
        original_result: originalResult,
        corrected_result: null,
        model: metadata.model,
        model_version: null,
        image_sha256: metadata.imageSha256,
      }).select("id").single();
      if (result.error || !result.data?.id) throw new Error("Recognition feedback save failed");
      return { feedbackId: result.data.id };
    },

    async updateFeedback(userId, feedbackId, input) {
      if (typeof feedbackId !== "string" || !uuidPattern.test(feedbackId)) throw invalid("反馈 ID 无效");
      const normalized = normalizeUpdateInput(input);
      const previous = await ownedRow(db, "recognition_feedback", feedbackId, userId,
        "id,user_id,feedback_type,original_result,corrected_result", "识别反馈");
      if (previous.feedback_type === "other" && normalized.note === null) throw invalid("请填写反馈内容");
      if (normalized.mealId) await ownedRow(db, "meal_records", normalized.mealId, userId, "id,user_id", "餐记录");
      const changes = { updated_at: new Date().toISOString() };
      if (normalized.mealId !== undefined) changes.meal_id = normalized.mealId;
      if (normalized.correctedResult !== undefined) changes.corrected_result = normalized.correctedResult;
      if (normalized.note !== undefined) {
        const current = await ownedRow(
          db,
          "recognition_feedback",
          feedbackId,
          userId,
          "id,user_id,corrected_result",
          "识别反馈",
        );
        const previous = current.corrected_result && typeof current.corrected_result === "object" && !Array.isArray(current.corrected_result)
          ? current.corrected_result
          : { mealType: null, title: null, items: [] };
        changes.corrected_result = { ...previous, note: normalized.note };
      }
      const result = await db.from("recognition_feedback")
        .update(changes)
        .eq("id", feedbackId)
        .eq("user_id", userId)
        .select("id")
        .single();
      if (result.error || !result.data?.id) throw new Error("Recognition feedback update failed");
      if (previous.feedback_type === "other" && normalized.note) {
        const content = feedbackContent({
          ...previous,
          corrected_result: changes.corrected_result ?? previous.corrected_result,
        });
        const existing = await db.from("user_feedback")
          .select("id")
          .eq("user_id", userId)
          .eq("client_request_id", feedbackId)
          .maybeSingle();
        if (existing.error) throw new Error("Feedback mirror read failed");
        const mirrored = existing.data?.id
          ? await db.from("user_feedback").update({ content }).eq("id", existing.data.id).eq("user_id", userId)
          : await db.from("user_feedback").insert({
              user_id: userId,
              category: "bug",
              content,
              client_request_id: feedbackId,
              device_context: { source: "recognition_feedback" },
            });
        if (mirrored.error && mirrored.error.code !== "23505") throw new Error("Feedback mirror save failed");
      }
      return { feedbackId: result.data.id };
    },
  };
}

module.exports = {
  createRecognitionFeedbackDataService,
  PublicRecognitionFeedbackError,
};
