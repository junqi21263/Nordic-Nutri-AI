import type { LocaleMessages } from "./types";

export const zhCN = {
  onboarding: {
    brand: "Nordic Nutri AI",
    step: "第 1 步，共 4 步",
    progressAriaLabel: "当前为第 1 步，共 4 步",
    backAriaLabel: "返回",
    title: "你的目标是什么？",
    subtitle: "AI 将根据你的目标，为你制定个性化营养计划。",
    continue: "继续",
    goals: {
      muscle_gain: {
        title: "增益增肌",
        description: "增加肌肉量与力量。",
      },
      fat_loss: {
        title: "轻盈减脂",
        description: "降低体脂，同时尽量保留肌肉。",
      },
      maintenance: {
        title: "保持状态",
        description: "维持稳定、均衡的身体状态。",
      },
      performance: {
        title: "健康饮食",
        description: "建立均衡、可持续的饮食习惯。",
      },
    },
  },
} satisfies LocaleMessages;
