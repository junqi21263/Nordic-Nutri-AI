import { Image, Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import {
  FALLBACK_AVATAR_SRC,
  isDefaultAvatarSentinel,
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
  const bundled = isDefaultAvatarSentinel(src) || !src;
  const [displaySrc, setDisplaySrc] = useState(preferred);

  useEffect(() => {
    setDisplaySrc(preferred);
  }, [preferred]);

  if (!displaySrc) {
    return <Text className={`avatar avatar--${size}`}>{label}</Text>;
  }

  return (
    <View className={`avatar avatar--${size} avatar--frame${bundled ? " avatar--bundled" : ""}`}>
      <Image
        className={`avatar__image${bundled ? " avatar__image--zoom" : ""}`}
        src={displaySrc}
        mode="aspectFill"
        onError={() => {
          if (displaySrc !== FALLBACK_AVATAR_SRC) {
            setDisplaySrc(FALLBACK_AVATAR_SRC);
          }
        }}
      />
    </View>
  );
}
