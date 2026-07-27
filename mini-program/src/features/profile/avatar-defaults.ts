import robot1 from "../../assets/avatars/robot-1.png";
import robot2 from "../../assets/avatars/robot-2.png";
import robot3 from "../../assets/avatars/robot-3.png";
import robot4 from "../../assets/avatars/robot-4.png";

const defaultAvatars: Record<string, string> = {
  "default:robot-1": robot1,
  "default:robot-2": robot2,
  "default:robot-3": robot3,
  "default:robot-4": robot4,
};

const defaultAvatarKeys = Object.keys(defaultAvatars);

export const FALLBACK_AVATAR_SRC = defaultAvatars["default:robot-1"];

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
 * - `default:robot-N` sentinels → local bundled robot asset
 * - plain https/wxfile/data URLs are returned as-is
 * - cloud/pgstore/empty/unknown → stable default robot (home/profile never blank)
 */
export function resolveAvatarUrl(url: string | null | undefined): string {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (trimmed && defaultAvatars[trimmed]) return defaultAvatars[trimmed];
  if (trimmed.startsWith("default:")) return FALLBACK_AVATAR_SRC;
  if (trimmed && isDisplayableRemoteAvatar(trimmed)) return trimmed;
  return FALLBACK_AVATAR_SRC;
}

/** Pick a random default robot sentinel for seeding new profiles. */
export function pickDefaultAvatarSentinel(exclude?: string | null): string {
  const options = defaultAvatarKeys.filter((key) => key !== exclude);
  return options[Math.floor(Math.random() * options.length)] || "default:robot-1";
}
