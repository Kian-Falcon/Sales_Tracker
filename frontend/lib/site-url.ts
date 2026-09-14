function normalizeSiteUrl(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function getBrowserSiteUrl() {
  if (typeof window !== "undefined" && window.location.origin) {
    return normalizeSiteUrl(window.location.origin);
  }

  return normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
}

export function getAuthCallbackUrl() {
  const siteUrl = getBrowserSiteUrl();
  if (!siteUrl) {
    return undefined;
  }

  return new URL("/api/auth/callback", siteUrl).toString();
}
