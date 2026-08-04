import { Image, Text, View } from "@tarojs/components";
import { NOVA_COACH_HERO_IMAGE } from "../../features/share/brand-cdn";

export interface CoachAvatarProps {
  status?: "idle" | "thinking";
}

export function CoachAvatar({ status = "idle" }: CoachAvatarProps) {
  return (
    <View className={`coach-avatar coach-avatar--${status}`} ariaLabel="NOVA 营养教练">
      <Image className="coach-avatar__image" src={NOVA_COACH_HERO_IMAGE} mode="aspectFill" />
      {status === "thinking" ? <Text className="coach-avatar__dots">•••</Text> : null}
    </View>
  );
}
