const { createQwenVisionService } = require("./qwen-vision-service.cjs");

function createDeepseekVisionService({ apiKey, model = "deepseek-v4-flash-vision-exp", requestCompletion, fetchImpl } = {}) {
  return createQwenVisionService({
    apiKey,
    flashModel: model,
    plusModel: model,
    endpoint: "https://api.deepseek.com/chat/completions",
    provider: "deepseek",
    requestCompletion,
    fetchImpl,
  });
}

module.exports = { createDeepseekVisionService };
