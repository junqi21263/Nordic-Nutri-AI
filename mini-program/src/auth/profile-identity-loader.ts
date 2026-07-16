import type { ProfilePreview, ProfileSettings } from "../stores/profile-store";

type IdentityRows = {
  profile: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export interface ProfileIdentityLoaderDependencies {
  beginUser: (userId: string) => void;
  hydrate: (userId: string, profile: Partial<ProfilePreview>, settings: Partial<ProfileSettings>) => void;
  getIdentity: (userId: string) => Promise<IdentityRows>;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function createProfileIdentityLoader(dependencies: ProfileIdentityLoaderDependencies) {
  return {
    async load(userId: string) {
      dependencies.beginUser(userId);
      const { profile, settings } = await dependencies.getIdentity(userId);
      dependencies.hydrate(userId, {
        nickname: stringOrUndefined(profile.nickname),
      }, {
        dietaryPattern: stringOrUndefined(settings.dietary_pattern) ?? null,
        foodAvoidances: Array.isArray(settings.food_avoidances) ? settings.food_avoidances.filter((item): item is string => typeof item === "string") : [],
        mealsPerDay: typeof settings.meals_per_day === "number" ? settings.meals_per_day : undefined,
        theme: settings.theme === "light" || settings.theme === "dark" || settings.theme === "system" ? settings.theme : undefined,
        language: settings.locale === "zh-CN" || settings.locale === "en" ? settings.locale : undefined,
        unit: settings.unit_system === "metric" || settings.unit_system === "imperial" ? settings.unit_system : undefined,
        notification: typeof settings.notification_enabled === "boolean" ? settings.notification_enabled : undefined,
      });
    },
  };
}
