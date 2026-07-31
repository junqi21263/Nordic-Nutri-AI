import { Image } from "@tarojs/components";
import back from "../../assets/icons/back.svg";
import check from "../../assets/icons/check.svg";
import checkInverse from "../../assets/icons/check-inverse.svg";
import goalMuscle from "../../assets/icons/goal-muscle.svg";
import goalFatLoss from "../../assets/icons/goal-fat-loss.svg";
import goalMaintenance from "../../assets/icons/goal-maintenance.svg";
import goalPerformance from "../../assets/icons/goal-performance.svg";
import activityLow from "../../assets/icons/activity-low.svg";
import activityLight from "../../assets/icons/activity-light.svg";
import activityModerate from "../../assets/icons/activity-moderate.svg";
import activityHigh from "../../assets/icons/activity-high.svg";
import nova from "../../assets/icons/nova.svg";
import celebration from "../../assets/icons/celebration.svg";
import flame from "../../assets/icons/flame.svg";
import protein from "../../assets/icons/protein.svg";
import carbs from "../../assets/icons/carbs.svg";
import fat from "../../assets/icons/fat.svg";
import milestone from "../../assets/icons/milestone.svg";
import scanBarcode from "../../assets/icons/scan-barcode.svg";
import circlePlus from "../../assets/icons/circle-plus.svg";
import pencil from "../../assets/icons/pencil.svg";
import sparkles from "../../assets/icons/sparkles.svg";
import ellipsis from "../../assets/icons/ellipsis.svg";
import home from "../../assets/icons/home.svg";
import scanLine from "../../assets/icons/scan-line.svg";
import listChecks from "../../assets/icons/list-checks.svg";
import bot from "../../assets/icons/bot.svg";
import userRound from "../../assets/icons/user-round.svg";
import camera from "../../assets/icons/camera.svg";
import images from "../../assets/icons/images.svg";
import zap from "../../assets/icons/zap.svg";
import timer from "../../assets/icons/timer.svg";
import switchCamera from "../../assets/icons/switch-camera.svg";
import utensils from "../../assets/icons/utensils.svg";
import x from "../../assets/icons/x.svg";
import calendarDays from "../../assets/icons/calendar-days.svg";
import ruler from "../../assets/icons/ruler.svg";
import weight from "../../assets/icons/weight.svg";
import mars from "../../assets/icons/mars.svg";
import venus from "../../assets/icons/venus.svg";
import arrowUp from "../../assets/icons/arrow-up.svg";
import heart from "../../assets/icons/heart.svg";
import heartFilled from "../../assets/icons/heart-filled.svg";
import trash2 from "../../assets/icons/trash-2.svg";
import chevronRight from "../../assets/icons/chevron-right.svg";
import refreshCw from "../../assets/icons/refresh-cw.svg";
import search from "../../assets/icons/search.svg";
import foodEgg from "../../assets/icons/food-egg.svg";
import foodMilk from "../../assets/icons/food-milk.svg";
import foodFish from "../../assets/icons/food-fish.svg";
import foodBean from "../../assets/icons/food-bean.svg";
import foodCarrot from "../../assets/icons/food-carrot.svg";
import foodApple from "../../assets/icons/food-apple.svg";
import foodCup from "../../assets/icons/food-cup.svg";
import foodPot from "../../assets/icons/food-pot.svg";
import foodSalt from "../../assets/icons/food-salt.svg";
import foodNuts from "../../assets/icons/food-nuts.svg";
import foodOil from "../../assets/icons/food-oil.svg";
import foodBread from "../../assets/icons/food-bread.svg";
import foodBowl from "../../assets/icons/food-bowl.svg";

export type NordicIconName =
  | "back"
  | "check"
  | "check-inverse"
  | "goal-muscle"
  | "goal-fat-loss"
  | "goal-maintenance"
  | "goal-performance"
  | "activity-low"
  | "activity-light"
  | "activity-moderate"
  | "activity-high"
  | "nova"
  | "celebration"
  | "flame"
  | "protein"
  | "carbs"
  | "fat"
  | "milestone"
  | "scan-barcode"
  | "circle-plus"
  | "pencil"
  | "sparkles"
  | "ellipsis"
  | "home"
  | "scan-line"
  | "list-checks"
  | "bot"
  | "user-round"
  | "camera"
  | "images"
  | "zap"
  | "timer"
  | "switch-camera"
  | "utensils"
  | "x"
  | "calendar-days"
  | "ruler"
  | "weight"
  | "mars"
  | "venus"
  | "arrow-up"
  | "heart"
  | "heart-filled"
  | "trash-2"
  | "chevron-right"
  | "refresh-cw"
  | "search"
  | "food-egg"
  | "food-milk"
  | "food-fish"
  | "food-bean"
  | "food-carrot"
  | "food-apple"
  | "food-cup"
  | "food-pot"
  | "food-salt"
  | "food-nuts"
  | "food-oil"
  | "food-bread"
  | "food-bowl";

export interface NordicIconProps {
  name: NordicIconName;
  size?: number;
  ariaLabel?: string;
}

const iconSources: Record<NordicIconName, string> = {
  back,
  check,
  "check-inverse": checkInverse,
  "goal-muscle": goalMuscle,
  "goal-fat-loss": goalFatLoss,
  "goal-maintenance": goalMaintenance,
  "goal-performance": goalPerformance,
  "activity-low": activityLow,
  "activity-light": activityLight,
  "activity-moderate": activityModerate,
  "activity-high": activityHigh,
  nova,
  celebration,
  flame,
  protein,
  carbs,
  fat,
  milestone,
  "scan-barcode": scanBarcode,
  "circle-plus": circlePlus,
  pencil,
  sparkles,
  ellipsis,
  home,
  "scan-line": scanLine,
  "list-checks": listChecks,
  bot,
  "user-round": userRound,
  camera,
  images,
  zap,
  timer,
  "switch-camera": switchCamera,
  utensils,
  x,
  "calendar-days": calendarDays,
  ruler,
  weight,
  mars,
  venus,
  "arrow-up": arrowUp,
  heart,
  "heart-filled": heartFilled,
  "trash-2": trash2,
  "chevron-right": chevronRight,
  "refresh-cw": refreshCw,
  search,
  "food-egg": foodEgg,
  "food-milk": foodMilk,
  "food-fish": foodFish,
  "food-bean": foodBean,
  "food-carrot": foodCarrot,
  "food-apple": foodApple,
  "food-cup": foodCup,
  "food-pot": foodPot,
  "food-salt": foodSalt,
  "food-nuts": foodNuts,
  "food-oil": foodOil,
  "food-bread": foodBread,
  "food-bowl": foodBowl,
};

/** Renderable local SVG asset for WeChat targets that do not expose Svg/Path components. */
export function NordicIcon({ name, size = 20, ariaLabel }: NordicIconProps) {
  return (
    <Image
      ariaLabel={ariaLabel}
      className="nordic-icon"
      mode="aspectFit"
      src={iconSources[name]}
      style={{ height: `${size}px`, width: `${size}px` }}
    />
  );
}
