import { validationError } from "./errors.ts";

export type JsonObject = Record<string, unknown>;

export async function parseJsonBody(request: Request): Promise<JsonObject> {
  try {
    const value: unknown = await request.json();
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw validationError("Request body must be a JSON object");
    }
    return value as JsonObject;
  } catch (error) {
    if (error instanceof Error && error.name === "AppError") throw error;
    throw validationError("Request body must be valid JSON");
  }
}

export function assertRequired(body: JsonObject, field: string): unknown {
  const value = body[field];
  if (value === undefined || value === null || value === "") {
    throw validationError(`${field} is required`, { field });
  }
  return value;
}

export function assertString(
  body: JsonObject,
  field: string,
  options: { minLength?: number; maxLength?: number } = {},
): string {
  const value = assertRequired(body, field);
  if (typeof value !== "string") throw validationError(`${field} must be a string`, { field });
  const normalized = value.trim();
  if (
    (options.minLength !== undefined && normalized.length < options.minLength) ||
    (options.maxLength !== undefined && normalized.length > options.maxLength)
  ) {
    throw validationError(`${field} has an invalid length`, { field });
  }
  return normalized;
}
