export const SECRET_FIELD_MASK = "••••••••";

export type InstallField = {
  id: string;
  secret?: boolean;
};

export type InstallHints = {
  accountId?: string;
  tokenHint?: string;
  apiKeyHint?: string;
};

export function hintsFromInstall(install?: InstallHints | null): Record<string, string> {
  if (!install) return {};
  const accountId = String(install.accountId || "").trim();
  const tokenHint = String(install.tokenHint || "").trim();
  const apiKeyHint = String(install.apiKeyHint || "").trim();
  return {
    ...(accountId ? { clientId: accountId } : {}),
    ...(tokenHint ? { accessToken: tokenHint, sessionToken: tokenHint } : {}),
    ...(apiKeyHint ? { apiKey: apiKeyHint } : {}),
  };
}

export function credsAfterInstall(install?: InstallHints | null, current: Record<string, string> = {}): Record<string, string> {
  const clientId = String(install?.accountId || current.clientId || "").trim();
  return clientId ? { clientId } : {};
}

export function displayInstallValue(
  field: InstallField,
  values: Record<string, string> = {},
  hints: Record<string, string> = {},
) {
  const typed = String(values[field.id] || "");
  if (typed) return typed;
  const hint = String(hints[field.id] || "");
  if (!hint) return "";
  return field.secret ? SECRET_FIELD_MASK : hint;
}

export function installValueForSubmit(
  field: InstallField,
  values: Record<string, string> = {},
  hints: Record<string, string> = {},
) {
  const typed = String(values[field.id] || "").trim();
  if (field.secret) {
    if (!typed || typed === SECRET_FIELD_MASK) return "";
    return typed;
  }
  return typed || String(hints[field.id] || "").trim();
}

export function displaySavedSecret(typed: string, hint?: string) {
  const value = String(typed || "");
  if (value.trim() && value !== SECRET_FIELD_MASK) return value;
  return String(hint || "").trim() ? SECRET_FIELD_MASK : "";
}

export function savedSecretForSubmit(typed: string) {
  const value = String(typed || "").trim();
  if (!value || value === SECRET_FIELD_MASK) return "";
  return value;
}
