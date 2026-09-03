const PRODUCTION_DAILY_LIMIT = 10;
const PRODUCTION_BURST_LIMIT = 3;
const DEV_ENV_ID = "test-dev-d4gyxnn0b5dfa2c8a";

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getVisionQuotaPolicy(env = process.env) {
  const isDev = String(env?.TCB_ENV || "").trim() === DEV_ENV_ID;
  return {
    dailyLimit: isDev ? positiveInteger(env.VISION_DEV_DAILY_LIMIT, 500) : PRODUCTION_DAILY_LIMIT,
    burstLimit: isDev ? positiveInteger(env.VISION_DEV_BURST_LIMIT, 50) : PRODUCTION_BURST_LIMIT,
    enforce: !isDev,
    isDev,
  };
}

module.exports = { getVisionQuotaPolicy, DEV_ENV_ID, PRODUCTION_DAILY_LIMIT, PRODUCTION_BURST_LIMIT };
