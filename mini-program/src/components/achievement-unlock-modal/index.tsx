import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo } from "react";
import { getAchievementRequirement } from "../../features/coach/achievement-catalog";
import { getAchievementIcon } from "../../features/coach/achievement-icons";
import { NordicIcon, type NordicIconName } from "../nordic-icon";

const particleCount = 40;
const particleTypes = ["fragment", "leaf", "spark", "dot"] as const;
const particleSizes = ["small", "medium", "large", "medium", "small", "large"] as const;
type ParticleType = (typeof particleTypes)[number];
type ParticleSize = (typeof particleSizes)[number];

export interface AchievementUnlockModalAchievement {
  id?: string;
  title: string;
  description?: string;
  progress?: number;
  level?: string;
  icon?: NordicIconName;
  requirement?: string;
  unlocked?: boolean;
  target?: number;
  unit?: string;
  unlockedAt?: string | null;
  celebrationPending?: boolean;
}

export interface AchievementUnlockModalProps {
  achievement: AchievementUnlockModalAchievement | null;
  onDismiss: () => Promise<boolean>;
}

interface ParticleSeed {
  type: ParticleType;
  size: ParticleSize;
  top: number;
  delay: number;
  duration: number;
  rotation: number;
  drift: number;
  impactX: number;
  impactY: number;
  scatterX: number;
  scatterY: number;
  endX: number;
  entryRise: number;
  fall: number;
}

function createRandom(seed: string) {
  let state = Array.from(seed).reduce((value, character) => (
    (value * 31 + character.charCodeAt(0)) >>> 0
  ), 2166136261);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createParticleSeeds(seed: string, side: "left" | "right"): ParticleSeed[] {
  const random = createRandom(`${seed}:${side}`);
  const direction = side === "left" ? 1 : -1;
  return Array.from({ length: particleCount }, (_, index) => ({
    type: particleTypes[index % particleTypes.length]!,
    size: particleSizes[Math.floor(random() * particleSizes.length)]!,
    // Each side starts from its own screen edge. Every seed has a separate
    // impact and exit point so the two streams cross as a broad band instead
    // of converging on one centre line.
    top: 35 + random() * 30,
    delay: Math.round(random() * 320),
    duration: Math.round(3800 + random() * 450),
    rotation: Math.round(-35 + random() * 70),
    drift: Math.round((random() - 0.5) * 7 * 10) / 10,
    impactX: direction * Math.round((32 + random() * 55) * 10) / 10,
    impactY: Math.round((-16 + random() * 20) * 10) / 10,
    scatterX: direction * Math.round((8 + random() * 96) * 10) / 10,
    scatterY: Math.round((-2 + random() * 23) * 10) / 10,
    endX: direction * Math.round((4 + random() * 104) * 10) / 10,
    entryRise: Math.round((-7 + random() * 12) * 10) / 10,
    fall: Math.round((44 + random() * 40) * 10) / 10,
  }));
}

export function AchievementUnlockModal({ achievement, onDismiss }: AchievementUnlockModalProps) {
  const particleSeeds = useMemo(() => ({
    left: createParticleSeeds(achievement?.id || achievement?.title || "achievement", "left"),
    right: createParticleSeeds(achievement?.id || achievement?.title || "achievement", "right"),
  }), [achievement?.id, achievement?.title]);

  if (!achievement) return null;

  const requirement = achievement.description || achievement.requirement || getAchievementRequirement(achievement.title);
  const icon = achievement.icon || getAchievementIcon({
    id: achievement.id || "",
    title: achievement.title,
  });
  const openAchievements = async () => {
    if (!await onDismiss()) return;
    void Taro.navigateTo({ url: "/pages/achievements/index" });
  };
  const renderParticles = (side: "left" | "right") => particleSeeds[side].map((particle, index) => (
    <View
      key={`${side}-${index}`}
      className={`achievement-unlock-overlay__particle achievement-unlock-overlay__particle--${particle.type} achievement-unlock-overlay__particle--${particle.size}`}
      style={{
        top: `${particle.top}%`,
        animationDelay: `${particle.delay}ms`,
        animationDuration: `${particle.duration}ms`,
        "--particle-drift": `${particle.drift}vw`,
        "--particle-rotation": `${particle.rotation}deg`,
        "--particle-impact-x": `${particle.impactX}vw`,
        "--particle-impact-y": `${particle.impactY}vh`,
        "--particle-scatter-x": `${particle.scatterX}vw`,
        "--particle-scatter-y": `${particle.scatterY}vh`,
        "--particle-end-x": `${particle.endX}vw`,
        "--particle-entry-rise": `${particle.entryRise}vh`,
        "--particle-fall": `${particle.fall}vh`,
      } as Record<string, string>}
    />
  ));

  return (
    <View className="achievement-unlock-overlay" ariaLabel="成就已解锁">
      <View className="achievement-unlock-overlay__backdrop" onClick={() => { void onDismiss(); }} />
      <View className="achievement-unlock-overlay__burst achievement-unlock-overlay__burst--left">
        {renderParticles("left")}
      </View>
      <View className="achievement-unlock-overlay__burst achievement-unlock-overlay__burst--right">
        {renderParticles("right")}
      </View>
      <View className="achievement-unlock-overlay__card">
        <View
          className="achievement-unlock-overlay__close"
          ariaLabel="关闭成就弹窗"
          onClick={() => { void onDismiss(); }}
        >
          <NordicIcon name="x" size={22} ariaLabel="关闭" />
        </View>
        <View className="achievement-unlock-overlay__icon">
          <NordicIcon name={icon} size={52} ariaLabel={achievement.title} />
          <View className="achievement-unlock-overlay__sparkle achievement-unlock-overlay__sparkle--top-right">
            <NordicIcon name="sparkles" size={20} ariaLabel="解锁闪光" />
          </View>
          <View className="achievement-unlock-overlay__sparkle achievement-unlock-overlay__sparkle--bottom-left">
            <NordicIcon name="sparkles" size={18} ariaLabel="解锁闪光" />
          </View>
        </View>
        <Text className="achievement-unlock-overlay__eyebrow">成就已解锁</Text>
        <Text className="achievement-unlock-overlay__title">{achievement.title}</Text>
        <Text className="achievement-unlock-overlay__copy">{requirement}</Text>
        <View className="achievement-unlock-overlay__primary-action" onClick={() => { void onDismiss(); }}>
          <Text>收下这份成就</Text>
        </View>
        <Text className="achievement-unlock-overlay__secondary-action" onClick={() => { void openAchievements(); }}>
          查看全部成就
        </Text>
      </View>
    </View>
  );
}
