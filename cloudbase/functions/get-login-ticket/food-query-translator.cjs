const https = require("node:https");

const COMMON_FOOD_TERMS = {
  "牛肉": "beef",
  "鸡肉": "chicken",
  "鸡胸肉": "chicken breast",
  "猪肉": "pork",
  "三文鱼": "salmon",
  "虾": "shrimp",
  "鸡蛋": "egg",
  "蛋白": "egg white",
  "牛奶": "milk",
  "酸奶": "yogurt",
  "希腊酸奶": "greek yogurt",
  "豆腐": "tofu",
  "米饭": "rice",
  "燕麦": "oatmeal",
  "香蕉": "banana",
  "苹果": "apple",
  "土豆": "potato",
  "西兰花": "broccoli",
};

function cleanTranslation(value) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return /^[a-zA-Z0-9 ,&'()/-]{2,80}$/.test(text) ? text : null;
}

function requestDeepSeekTranslation({ apiKey, query, model }) {
  const requestBody = JSON.stringify({
    model,
    temperature: 0,
    max_tokens: 20,
    messages: [
      { role: "system", content: "Translate a food name into a short English keyword for USDA FoodData Central. Reply with only the keyword, no punctuation or explanation." },
      { role: "user", content: query },
    ],
  });
  return new Promise((resolve, reject) => {
    const request = https.request("https://api.deepseek.com/chat/completions", {
      method: "POST",
      timeout: 5000,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Length": Buffer.byteLength(requestBody),
      },
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        if (response.statusCode !== 200) return reject(new Error("Food translation request failed"));
        try { resolve(cleanTranslation(JSON.parse(raw)?.choices?.[0]?.message?.content)); } catch { reject(new Error("Food translation response was invalid")); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("Food translation timed out")));
    request.on("error", reject);
    request.end(requestBody);
  });
}

function createFoodQueryTranslator({ apiKey, model = "deepseek-v4-flash", translate = requestDeepSeekTranslation }) {
  return async (query) => {
    if (COMMON_FOOD_TERMS[query]) return COMMON_FOOD_TERMS[query];
    if (typeof apiKey !== "string" || !apiKey) return null;
    return translate({ apiKey, query, model });
  };
}

module.exports = { COMMON_FOOD_TERMS, cleanTranslation, createFoodQueryTranslator, requestDeepSeekTranslation };
