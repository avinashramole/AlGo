export const SECRET_FIELD_MASK = "••••••••";

export type InstallField = {
  id: string;
  secret?: boolean;
};

export type InstallHints = {
  accountId?: string;
  tokenHint?: string;
  apiKeyHint?: string;
  sessionHint?: string;
  hasApiKey?: boolean;
  hasApiSecret?: boolean;
  oauthReady?: boolean;
  installed?: boolean;
  tokenUpdatedAt?: string;
  brokerId?: string;
};

export function hintsFromInstall(install?: InstallHints | null): Record<string, string> {
  if (!install) return {};
  const accountId = String(install.accountId || "").trim();
  const tokenHint = String(install.tokenHint || "").trim();
  const apiKeyHint = String(install.apiKeyHint || "").trim();
  const sessionHint = String(install.sessionHint || "").trim();
  return {
    ...(accountId ? { clientId: accountId } : {}),
    ...(tokenHint ? { accessToken: tokenHint } : {}),
    ...(apiKeyHint ? { apiKey: apiKeyHint } : {}),
    ...(sessionHint ? { sessionToken: sessionHint } : {}),
  };
}

function keepTypedSecrets(current: Record<string, string> = {}) {
  const next: Record<string, string> = {};
  for (const id of ["apiKey", "sessionToken", "accessToken"]) {
    const value = String(current[id] || "").trim();
    if (value && value !== SECRET_FIELD_MASK) next[id] = current[id];
  }
  return next;
}

export function credsAfterInstall(
  install?: InstallHints | null,
  current: Record<string, string> = {},
  { keepTyped = false }: { keepTyped?: boolean } = {},
): Record<string, string> {
  const installed = String(install?.accountId || "").trim();
  const typed = String(current.clientId || "").trim();
  const secrets = keepTyped ? keepTypedSecrets(current) : {};
  if (keepTyped && typed && typed !== installed) return { clientId: typed, ...secrets };
  if (installed) return { clientId: installed, ...secrets };
  return typed ? { clientId: typed, ...secrets } : { ...secrets };
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

export function installFlags(install?: InstallHints | null) {
  const hasClientId = Boolean(String(install?.accountId || "").trim());
  const hasApiKey = Boolean(install?.hasApiKey || String(install?.apiKeyHint || "").trim());
  const hasApiSecret = Boolean(install?.hasApiSecret || String(install?.sessionHint || "").trim());
  const hasTradingToken = Boolean(install?.installed || String(install?.tokenHint || "").trim());
  return {
    hasClientId,
    hasApiKey,
    hasApiSecret,
    hasTradingToken,
    oauthReady: Boolean(install?.oauthReady || (hasApiKey && hasApiSecret)),
  };
}

function installBits(install?: InstallHints | null) {
  const flags = installFlags(install);
  const bits: string[] = [];
  if (flags.hasClientId) bits.push(`Client ID ${String(install?.accountId || "").trim()}`);
  if (flags.hasApiKey) bits.push(`API key ${String(install?.apiKeyHint || "").trim() || "saved"}`);
  if (flags.hasApiSecret) bits.push(`API secret ${String(install?.sessionHint || "").trim() || "saved"}`);
  if (flags.hasTradingToken) bits.push(`trading token ${String(install?.tokenHint || "").trim() || "saved"}`);
  return { flags, bits };
}

export function describeBrokerInstall(install?: InstallHints | null, brokerId = "") {
  const id = String(brokerId || install?.brokerId || "").trim().toLowerCase();
  const { flags, bits } = installBits(install);
  if (flags.hasTradingToken) return bits.join(" · ");
  if (flags.oauthReady) {
    return bits.length
      ? `${bits.join(" · ")}. No trading token yet — tap Get today's trading token.`
      : "API key and secret saved. No trading token yet — tap Get today's trading token.";
  }
  if (bits.length) {
    return `${bits.join(" · ")}. ${
      id === "upstox" ? "Save API key and API secret, then generate today's token." : "No access token installed yet."
    }`;
  }
  return id === "upstox"
    ? "No API key, API secret, or trading token stored yet."
    : "No access token installed yet.";
}

export function describeBrokerSave(install?: InstallHints | null, brokerId = "") {
  const id = String(brokerId || install?.brokerId || "").trim().toLowerCase();
  const { flags, bits } = installBits(install);
  const saved = bits.length ? bits.join(" · ") : "Credentials";
  if (id === "upstox" && flags.oauthReady && !flags.hasTradingToken) {
    return `${saved} saved on this account. Tap Get today's trading token next. Desk LIVE was not started.`;
  }
  if (flags.hasTradingToken) {
    return `${saved} saved on this account. Live copy now uses this token. Desk LIVE was not started.`;
  }
  return `${saved} saved on this account and on admin Users. Desk LIVE was not started.`;
}

export function tradingTokenArrived(
  before?: Pick<InstallHints, "tokenHint" | "tokenUpdatedAt" | "installed"> | null,
  next?: Pick<InstallHints, "tokenHint" | "tokenUpdatedAt" | "installed"> | null,
) {
  const nextHint = String(next?.tokenHint || "").trim();
  const nextUpdated = String(next?.tokenUpdatedAt || "").trim();
  if (!next?.installed && !nextHint) return false;
  const beforeHint = String(before?.tokenHint || "").trim();
  const beforeUpdated = String(before?.tokenUpdatedAt || "").trim();
  if (!beforeHint && !beforeUpdated) return true;
  return nextHint !== beforeHint || nextUpdated !== beforeUpdated;
}
