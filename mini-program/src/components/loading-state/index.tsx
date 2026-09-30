import { View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
import { Loading } from "../loading";
export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View className="state state--loading">
      <Loading label={label ?? t("sharedUi.loadingContent")} />
    </View>
  );
}
