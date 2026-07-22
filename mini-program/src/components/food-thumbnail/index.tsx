import { Image } from "@tarojs/components";
import { useEffect, useState } from "react";
import type { ProductFoodCatalogItem } from "../../api/food-catalog-api";
import { getFoodVisualFallback, resolveFoodVisual } from "../../features/food-catalog/food-visuals";

interface FoodThumbnailProps {
  className: string;
  food: ProductFoodCatalogItem;
}

export function FoodThumbnail({ className, food }: FoodThumbnailProps) {
  const fallback = getFoodVisualFallback(food);
  const preferred = resolveFoodVisual(food);
  const [source, setSource] = useState(preferred);

  useEffect(() => {
    setSource(preferred);
  }, [preferred]);

  return (
    <Image
      className={className}
      src={source}
      mode="aspectFill"
      onError={() => setSource(fallback)}
    />
  );
}
