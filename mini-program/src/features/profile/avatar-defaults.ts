import food1 from "../../assets/avatars/food-1.jpg";
import food2 from "../../assets/avatars/food-2.jpg";
import food3 from "../../assets/avatars/food-3.jpg";
import food4 from "../../assets/avatars/food-4.jpg";
import food5 from "../../assets/avatars/food-5.jpg";
import food6 from "../../assets/avatars/food-6.jpg";
import food7 from "../../assets/avatars/food-7.jpg";
import food8 from "../../assets/avatars/food-8.jpg";

const foodAvatars = [food1, food2, food3, food4, food5, food6, food7, food8] as const;

export const DEFAULT_AVATAR_COUNT = foodAvatars.length;

const defaultAvatars: Record<string, string> = Object.fromEntries(
  foodAvatars.map((src, index) => [`default:food-${index + 1}`, src]),
);

// Legacy robot sentinels still resolve so existing profiles keep a visible avatar.
for (let index = 1; index <= 4; index += 1) {
  defaultAvatars[`default:robot-${index}`] = foodAvatars[index - 1];
}

const defaultAvatarKeys = Array.from({ length: DEFAULT_AVATAR_COUNT }, (_, index) => `default:food-${index + 1}`);

export const FALLBACK_AVATAR_SRC = defaultAvatars["default:food-1"];

function isDisplayableRemoteAvatar(url: string): boolean {
  return (
    /^https?:\/\//i.test(url) ||
    url.startsWith("data:image/") ||
    url.startsWith("wxfile://") ||
    url.startsWith("http://tmp/") ||
    url.startsWith("blob:")
  );
}

/**
 * Resolve an avatar reference to a displayable image source.
 * - `default:food-N` / legacy `default:robot-N` sentinels → local bundled asset
 * - plain https/wxfile/data URLs are returned as-is
 * - cloud/pgstore/empty/unknown → stable default food avatar (home/profile never blank)
 */
export function resolveAvatarUrl(url: string | null | undefined): string {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (trimmed && defaultAvatars[trimmed]) return defaultAvatars[trimmed];
  if (trimmed.startsWith("default:")) return FALLBACK_AVATAR_SRC;
  if (trimmed && isDisplayableRemoteAvatar(trimmed)) return trimmed;
  return FALLBACK_AVATAR_SRC;
}

/** Pick a random default food sentinel for seeding / randomize. */
export function pickDefaultAvatarSentinel(exclude?: string | null): string {
  let normalizedExclude = typeof exclude === "string" ? exclude.trim() : "";
  const legacyRobot = normalizedExclude.match(/^default:robot-([1-4])$/);
  if (legacyRobot) normalizedExclude = `default:food-${legacyRobot[1]}`;
  const options = defaultAvatarKeys.filter((key) => key !== normalizedExclude);
  return options[Math.floor(Math.random() * options.length)] || "default:food-1";
}

export function isDefaultAvatarSentinel(value: string | null | undefined): boolean {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return Boolean(trimmed && defaultAvatars[trimmed]);
}
