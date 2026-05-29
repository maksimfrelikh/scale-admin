export type BannerImageUrlValidationResult =
  | { valid: true; value: string }
  | { valid: false; reasonKey: 'errors.advertising.imageUrlRequired' | 'errors.advertising.imageUrlMustBeHttpUrl' };

export function validateBannerImageUrl(value: unknown): BannerImageUrlValidationResult {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { valid: false, reasonKey: 'errors.advertising.imageUrlRequired' };
  }
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reasonKey: 'errors.advertising.imageUrlMustBeHttpUrl' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reasonKey: 'errors.advertising.imageUrlMustBeHttpUrl' };
  }
  return { valid: true, value: trimmed };
}
