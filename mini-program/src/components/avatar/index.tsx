import { Image, Text } from "@tarojs/components";
import { useEffect, useState } from "react";
import {
  FALLBACK_AVATAR_SRC,
  resolveAvatarUrl,
} from "../../features/profile/avatar-defaults";

export function Avatar({
  label,
  src = null,
  size = "medium",
}: {
  label: string;
  src?: string | null;
  size?: "small" | "medium" | "large" | "home";
}) {
  const preferred = resolveAvatarUrl(src);
  const [displaySrc, setDisplaySrc] = useState(preferred);

  useEffect(() => {
    setDisplaySrc(preferred);
  }, [preferred]);

  if (!displaySrc) {
    return <Text className={`avatar avatar--${size}`}>{label}</Text>;
  }

  return (
    <Image
      className={`avatar avatar--${size} avatar--image`}
      src={displaySrc}
      mode="aspectFill"
      onError={() => {
        if (displaySrc !== FALLBACK_AVATAR_SRC) {
          setDisplaySrc(FALLBACK_AVATAR_SRC);
        }
      }}
    />
  );
}
