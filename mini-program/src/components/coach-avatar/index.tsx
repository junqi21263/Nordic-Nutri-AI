import { Image, Text, View } from "@tarojs/components";
import novaCoachHero from "../../assets/images/nova-coach-hero.jpg";

export interface CoachAvatarProps {
  status?: "idle" | "thinking";
  variant?: "avatar" | "hero";
}

export function CoachAvatar({ status = "idle", variant = "avatar" }: CoachAvatarProps) {
  return (
    <View
      className={`coach-avatar coach-avatar--${variant} coach-avatar--${status}`}
      ariaLabel="NOVA 营养教练"
    >
      <Image
        className="coach-avatar__image"
        src={novaCoachHero}
        mode={variant === "hero" ? "aspectFit" : "aspectFill"}
      />
      {status === "thinking" ? <Text className="coach-avatar__dots">•••</Text> : null}
    </View>
  );
}
