function joinUrl(baseUrl, path) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error("path must start with a slash");
  }
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export function buildApiRequest({ baseUrl, path, method, token, body }) {
  const headers = { accept: "application/json", "cache-control": "no-cache" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return {
    url: joinUrl(baseUrl, path),
    options: {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    safeLabel: `${method} ${path}`,
  };
}

export async function callApi(request, { timeoutMs = 15_000 } = {}) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetch(request.url, { ...request.options, signal: abort.signal });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
    return { status: response.status, headers: Object.fromEntries(response.headers), body };
  } finally {
    clearTimeout(timer);
  }
}
