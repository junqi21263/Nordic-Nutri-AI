const TRANSIENT_DB_ERROR = /timeout|timed out|connection|network|temporar|unavailable|gateway|fetch failed|reset/i;

function isTransientDbError(error) {
  const code = String(error?.code || "");
  if (/^(08[A-Z0-9]{3}|40001|40P01|53300|57P0[123]|ECONNRESET|ETIMEDOUT|EAI_AGAIN)$/.test(code)) return true;
  if (/^[0-9A-Z]{5}$/.test(code)) return false;
  const message = error?.message || error?.error_description || error?.details || error;
  return TRANSIENT_DB_ERROR.test(String(message || ""));
}

async function withDbReadRetry(read, { retries = 1, delayMs = 80 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      const result = await read();
      if (!result?.error || attempt >= retries || !isTransientDbError(result.error)) return result;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      if (attempt >= retries || !isTransientDbError(error)) throw error;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    attempt += 1;
  }
}

module.exports = { isTransientDbError, withDbReadRetry };
