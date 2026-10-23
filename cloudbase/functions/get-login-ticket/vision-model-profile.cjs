function configError(code = "VISION_MODEL_CONFIG_INVALID") {
  return Object.assign(new Error(code), { code });
}
function resolveVisionProfile(route = {}) {
  const protocol = route.protocol || "openai-chat-completions";
  if (
    !["openai-chat-completions", "sensenova-native-chat-completions"].includes(
      protocol,
    )
  )
    throw configError("VISION_PROTOCOL_UNSUPPORTED");
  const input = route.metadata?.vision || {};
  if (typeof input !== "object" || Array.isArray(input)) throw configError();
  if (
    protocol === "sensenova-native-chat-completions" &&
    route.providerKey !== "sensenova"
  )
    throw configError("VISION_PROTOCOL_UNSUPPORTED");
  const deepseek = route.providerKey === "deepseek";
  const boundedQwen =
    route.providerKey === "qwen" && /^qwen3\.8-/i.test(route.modelKey || "");
  const profile = {
    imageInput: input.imageInput ?? "auto",
    preferInline: deepseek,
    thinkingMode: input.thinkingMode ?? (deepseek ? "enabled" : "unsupported"),
    supportsReasoningEffort:
      input.supportsReasoningEffort ?? (deepseek || boundedQwen),
    reasoningEffort: input.reasoningEffort ?? "low",
    jsonMode: input.jsonMode ?? false,
    supportsTemperature: input.supportsTemperature ?? true,
    maxTokensField: input.maxTokensField ?? "max_tokens",
    imageDetail: input.imageDetail ?? (deepseek ? "auto" : null),
  };
  if (
    !["auto", "url", "inline"].includes(profile.imageInput) ||
    !["enabled", "disabled", "unsupported"].includes(profile.thinkingMode) ||
    !["low", "medium", "high"].includes(profile.reasoningEffort) ||
    typeof profile.supportsReasoningEffort !== "boolean" ||
    typeof profile.jsonMode !== "boolean" ||
    typeof profile.supportsTemperature !== "boolean" ||
    !["max_tokens", "max_completion_tokens", "max_new_tokens"].includes(profile.maxTokensField) ||
    ![null, "auto", "low", "high"].includes(profile.imageDetail)
  )
    throw configError();
  return profile;
}
function visionRequestParameters(profile, effort) {
  return {
    ...(profile.thinkingMode !== "unsupported"
      ? { thinking: { type: profile.thinkingMode } }
      : {}),
    ...(profile.supportsReasoningEffort
      ? { reasoning_effort: effort || profile.reasoningEffort }
      : {}),
    ...(profile.jsonMode ? { response_format: { type: "json_object" } } : {}),
  };
}
function selectVisionImage(profile, imageUrl, imageDataUrl) {
  const inline = /^data:image\//i.test(String(imageDataUrl || ""))
    ? imageDataUrl
    : /^data:image\//i.test(String(imageUrl || ""))
      ? imageUrl
      : null;
  const remote = /^https:\/\//i.test(String(imageUrl || "")) ? imageUrl : null;
  const selected =
    profile.imageInput === "inline"
      ? inline
      : profile.imageInput === "url"
        ? remote
        : profile.preferInline
          ? inline || remote
          : remote || inline;
  if (!selected) throw configError("VISION_MEDIA_UNSUPPORTED");
  return selected;
}
module.exports = {
  resolveVisionProfile,
  visionRequestParameters,
  selectVisionImage,
};
