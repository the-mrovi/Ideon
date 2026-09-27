export function isLegacySupabaseJwt(value: string) {
  return value.split(".").length === 3 && value.startsWith("eyJ");
}

export function buildSupabaseHeaders(apiKey: string, accessToken?: string) {
  return {
    apikey: apiKey,
    ...(accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : isLegacySupabaseJwt(apiKey)
        ? { Authorization: `Bearer ${apiKey}` }
        : {}),
  };
}
