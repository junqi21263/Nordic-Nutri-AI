import { Image, Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
import { NOVA_COACH_HERO_IMAGE } from "../../features/share/brand-cdn";

export interface CoachAvatarProps {
  status?: "idle" | "thinking";
}

export function CoachAvatar({ status = "idle" }: CoachAvatarProps) {
  const { t } = useTranslation();
  return (
    <View className={`coach-avatar coach-avatar--${status}`} ariaLabel={t("coachPage.title")}>
      <Image className="coach-avatar__image" src={NOVA_COACH_HERO_IMAGE} mode="aspectFill" />
      {status === "thinking" ? <Text className="coach-avatar__dots">•••</Text> : null}
    </View>
  );
}
