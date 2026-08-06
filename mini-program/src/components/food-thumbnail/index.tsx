import { Image, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import type { ProductFoodCatalogItem } from "../../api/food-catalog-api";
import { getFoodVisualFallback, resolveFoodVisual } from "../../features/food-catalog/food-visuals";
import { NordicIcon } from "../nordic-icon";

interface FoodThumbnailProps {
  className: string;
  food: ProductFoodCatalogItem;
  iconSize?: number;
  /** list cards use list/thumb; detail pages may prefer detailUrl */
  prefer?: "list" | "detail" | "thumb";
  showSkeleton?: boolean;
  /** Lock the frame aspect ratio (e.g. 1 for square detail hero). */
  aspectRatio?: number;
}

export function FoodThumbnail({
  className,
  food,
  iconSize = 28,
  prefer = "list",
  showSkeleton = true,
  /** When set, locks frame ratio (detail swipe must stay square to avoid layout jump). */
  aspectRatio,
}: FoodThumbnailProps) {
  const preferred = resolveFoodVisual(food, prefer);
  const fallback = getFoodVisualFallback(food);
  const lockedRatio = aspectRatio ?? (prefer === "detail" ? 1 : undefined);
  const frameStyle = lockedRatio
    ? { aspectRatio: String(lockedRatio), height: "auto" }
    : undefined;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [preferred]);

  // Empty URL: never render a broken <Image> icon — use category placeholder.
  if (!preferred || failed) {
    return (
      <View
        className={`${className} food-thumbnail food-thumbnail--fallback food-thumbnail--${fallback.tone}`}
        style={frameStyle}
      >
        <NordicIcon name={fallback.icon} size={iconSize} ariaLabel={food.description} />
      </View>
    );
  }

  return (
    <View className={`${className} food-thumbnail food-thumbnail--frame`} style={frameStyle}>
      {showSkeleton && !loaded ? (
        <View className={`food-thumbnail__skeleton food-thumbnail--${fallback.tone}`} />
      ) : null}
      <Image
        className="food-thumbnail__image"
        src={preferred}
        mode="aspectFill"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </View>
  );
}
