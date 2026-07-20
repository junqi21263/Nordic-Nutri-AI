const FALLBACK_ORIGIN = "https://mini-program.invalid";
const ABSOLUTE_URL = /^([a-z][a-z\d+.-]*:)?\/\//i;

type UrlParts = {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
};

function parseAbsoluteUrl(value: string): UrlParts {
  const match = value.match(/^([a-z][a-z\d+.-]*:)(?:\/\/)([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i);
  if (!match) throw new TypeError("Failed to construct 'URL': Invalid URL");

  const [, protocol, host, pathname, search = "", hash = ""] = match;
  const portIndex = host.lastIndexOf(":");
  const hasPort = portIndex > -1 && host.indexOf("]") < portIndex;
  return {
    protocol: protocol.toLowerCase(),
    hostname: hasPort ? host.slice(0, portIndex) : host,
    port: hasPort ? host.slice(portIndex + 1) : "",
    pathname: pathname || "/",
    search,
    hash,
  };
}

function toUrlText(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

function resolveUrl(input: unknown, base?: unknown): UrlParts {
  const value = toUrlText(input).trim();
  if (ABSOLUTE_URL.test(value)) return parseAbsoluteUrl(value);

  const baseValue = base === undefined ? FALLBACK_ORIGIN : toUrlText(base).trim();
  if (!ABSOLUTE_URL.test(baseValue)) throw new TypeError("Failed to construct 'URL': Invalid base URL");
  const parsedBase = parseAbsoluteUrl(baseValue);
  const prefix = `${parsedBase.protocol}//${parsedBase.hostname}${parsedBase.port ? `:${parsedBase.port}` : ""}`;
  if (!value) return parsedBase;
  if (value.startsWith("//")) return parseAbsoluteUrl(`${parsedBase.protocol}${value}`);
  if (value.startsWith("/")) return parseAbsoluteUrl(`${prefix}${value}`);
  return parseAbsoluteUrl(`${prefix}/${value}`);
}

class SyncedSearchParams {
  private pairs: Array<[string, string]>;

  constructor(search: string, private readonly sync: (search: string) => void) {
    this.pairs = search.replace(/^\?/, "").split("&").filter(Boolean).map((item) => {
      const [key, value = ""] = item.split("=", 2);
      return [decode(key), decode(value)];
    });
  }

  append(name: string, value: string): void { this.pairs.push([name, value]); this.update(); }
  delete(name: string): void { this.pairs = this.pairs.filter(([key]) => key !== name); this.update(); }
  get(name: string): string | null { return this.pairs.find(([key]) => key === name)?.[1] ?? null; }
  getAll(name: string): string[] { return this.pairs.filter(([key]) => key === name).map(([, value]) => value); }
  has(name: string): boolean { return this.pairs.some(([key]) => key === name); }
  set(name: string, value: string): void {
    const index = this.pairs.findIndex(([key]) => key === name);
    if (index < 0) this.pairs.push([name, value]);
    else this.pairs = this.pairs.filter(([key], itemIndex) => key !== name || itemIndex === index);
    this.pairs[index < 0 ? this.pairs.length - 1 : index] = [name, value];
    this.update();
  }
  forEach(callback: (value: string, key: string, parent: URLSearchParams) => void, thisArg?: unknown): void {
    this.pairs.forEach(([key, value]) => callback.call(thisArg, value, key, this as unknown as URLSearchParams));
  }
  toString(): string { return this.pairs.map(([key, value]) => `${encode(key)}=${encode(value)}`).join("&"); }
  entries(): IterableIterator<[string, string]> { return this.pairs.slice()[Symbol.iterator](); }
  keys(): IterableIterator<string> { return this.pairs.map(([key]) => key)[Symbol.iterator](); }
  values(): IterableIterator<string> { return this.pairs.map(([, value]) => value)[Symbol.iterator](); }
  [Symbol.iterator](): IterableIterator<[string, string]> { return this.entries(); }

  private update(): void {
    const value = this.toString();
    this.sync(value ? `?${value}` : "");
  }
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

/**
 * Taro 4.2's injected URL only accepts http(s). Supabase creates a wss URL
 * while initializing Realtime even when the app never subscribes to Realtime.
 * This browser-compatible subset is injected only for free URL references in
 * dependencies, while Taro's own runtime URL remains unchanged.
 */
export class URL {
  private protocolValue: string;
  private hostnameValue: string;
  private portValue: string;
  private pathnameValue: string;
  private searchValue: string;
  private hashValue: string;
  private readonly params: SyncedSearchParams;

  constructor(input: string | URL, base?: string | URL) {
    const parts = resolveUrl(input, base);
    this.protocolValue = parts.protocol;
    this.hostnameValue = parts.hostname;
    this.portValue = parts.port;
    this.pathnameValue = parts.pathname;
    this.searchValue = parts.search;
    this.hashValue = parts.hash;
    this.params = new SyncedSearchParams(this.searchValue, (search) => { this.searchValue = search; });
  }

  get protocol(): string { return this.protocolValue; }
  set protocol(value: string) { this.protocolValue = value.endsWith(":") ? value : `${value}:`; }
  get hostname(): string { return this.hostnameValue; }
  set hostname(value: string) { this.hostnameValue = value; }
  get port(): string { return this.portValue; }
  set port(value: string) { this.portValue = value; }
  get host(): string { return `${this.hostnameValue}${this.portValue ? `:${this.portValue}` : ""}`; }
  set host(value: string) {
    const parts = parseAbsoluteUrl(`${this.protocolValue}//${value}`);
    this.hostnameValue = parts.hostname;
    this.portValue = parts.port;
  }
  get pathname(): string { return this.pathnameValue; }
  set pathname(value: string) { this.pathnameValue = value.startsWith("/") ? value : `/${value}`; }
  get search(): string { return this.searchValue; }
  set search(value: string) { this.searchValue = value && !value.startsWith("?") ? `?${value}` : value; }
  get hash(): string { return this.hashValue; }
  set hash(value: string) { this.hashValue = value && !value.startsWith("#") ? `#${value}` : value; }
  get origin(): string { return `${this.protocolValue}//${this.host}`; }
  get href(): string { return `${this.origin}${this.pathnameValue}${this.searchValue}${this.hashValue}`; }
  set href(value: string) {
    const parts = resolveUrl(value);
    this.protocolValue = parts.protocol;
    this.hostnameValue = parts.hostname;
    this.portValue = parts.port;
    this.pathnameValue = parts.pathname;
    this.searchValue = parts.search;
    this.hashValue = parts.hash;
  }
  get searchParams(): URLSearchParams { return this.params as unknown as URLSearchParams; }
  toString(): string { return this.href; }
  toJSON(): string { return this.href; }
}
