export const CLOUDBASE_ENV_ID = "lewis-healthy-d4glgqqzv73a5bc10";

export function validatePgBaseline(value) {
  return value?.envId === CLOUDBASE_ENV_ID
    && value?.runtimeMode === "postgresql"
    && typeof value?.capturedAt === "string"
    && !Number.isNaN(Date.parse(value.capturedAt))
    && Array.isArray(value?.objects)
    && value.objects.every((object) => (
      typeof object?.schema === "string"
      && typeof object?.name === "string"
      && typeof object?.type === "string"
    ));
}

export function createPgBaseline(objects, capturedAt = new Date().toISOString()) {
  const baseline = {
    envId: CLOUDBASE_ENV_ID,
    runtimeMode: "postgresql",
    capturedAt,
    objects: objects.map(({ schema, name, type }) => ({ schema, name, type })),
  };
  if (!validatePgBaseline(baseline)) throw new Error("Invalid CloudBase PostgreSQL baseline");
  return baseline;
}
