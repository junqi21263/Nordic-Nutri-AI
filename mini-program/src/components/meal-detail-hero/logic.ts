/** Only remote / CloudBase / temporary camera images can become the Photo Hero. */
export function hasValidMealImage(imageUrl?: string | null) {
  const value = imageUrl?.trim();
  if (!value) return false;
  if (/placeholder|default[-_]?meal|meal-(?:bowl|oats|salmon)\.svg/i.test(value)) return false;
  return /^(https:\/\/|cloud:\/\/|wxfile:\/\/)/i.test(value);
}
