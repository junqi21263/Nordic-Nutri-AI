// Missing locale preserves the behavior of previously released clients.
function normalizeLocale(value) {
  if (value == null || value === "") return "zh-CN";
  const code = String(value).replace(/_/g, "-").toLowerCase();
  if (/^zh-(tw|hk|mo|hant)(-|$)/.test(code)) return "zh-TW";
  if (/^zh-(cn|sg|hans)(-|$)/.test(code)) return "zh-CN";
  return "en";
}
function localeInstruction(locale) {
  const language = { "zh-CN": "Simplified Chinese", "zh-TW": "Traditional Chinese used in Taiwan", en: "English" }[normalizeLocale(locale)];
  return "\nOUTPUT LANGUAGE: " + language + ". This overrides language examples above. Localize only natural-language values; preserve JSON keys, enum codes, units and factual numbers. Never translate user-provided quotations or names.";
}
module.exports = { normalizeLocale, localeInstruction };
