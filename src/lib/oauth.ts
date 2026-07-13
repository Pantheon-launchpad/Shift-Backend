// Generic OAuth "authorization code" flow, provider-configured. Only Google
// is wired with real credentials right now — GitHub/Figma have their config
// shape ready but will 501 until GOOGLE-style env vars are added for them
// too (see PROVIDERS below).
//
// State/CSRF: a random token is generated on /start, stored server-side
// with a short TTL, and must come back unchanged on /callback. This is an
// in-memory Map, which is fine for a single backend instance (hackathon
// MVP); move it to Redis if you ever run more than one instance, since a
// user could hit a different instance between /start and /callback.

import { randomBytes } from "crypto";

export interface OAuthProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scope: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
  extractProfile: (raw: any) => { providerUserId: string; email: string; name: string };
}

export const PROVIDERS: Record<string, OAuthProviderConfig> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    extractProfile: (raw) => ({ providerUserId: raw.sub, email: raw.email, name: raw.name ?? raw.email }),
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userinfoUrl: "https://api.github.com/user",
    scope: "read:user user:email",
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    extractProfile: (raw) => ({ providerUserId: String(raw.id), email: raw.email ?? `${raw.login}@users.noreply.github.com`, name: raw.name ?? raw.login }),
  },
  figma: {
    authorizeUrl: "https://www.figma.com/oauth",
    tokenUrl: "https://www.figma.com/api/oauth/token",
    userinfoUrl: "https://api.figma.com/v1/me",
    scope: "file_read",
    clientId: process.env.FIGMA_CLIENT_ID,
    clientSecret: process.env.FIGMA_CLIENT_SECRET,
    extractProfile: (raw) => ({ providerUserId: raw.id, email: raw.email, name: raw.handle ?? raw.email }),
  },
};

const STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthPlatform = "web" | "native";

interface PendingState {
  createdAt: number;
  intent: "login" | "connect";
  userId?: string;
  /** Which client started the flow — decides whether /callback redirects to FRONTEND_URL or the RN app's deep link. */
  platform: OAuthPlatform;
}

const pendingStates = new Map<string, PendingState>();

export function createState(intent: "login" | "connect", platform: OAuthPlatform, userId?: string): string {
  const state = randomBytes(24).toString("base64url");
  pendingStates.set(state, { createdAt: Date.now(), intent, userId, platform });
  return state;
}

export function consumeState(state: string): PendingState | null {
  const entry = pendingStates.get(state);
  if (!entry) return null;
  pendingStates.delete(state);
  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;
  return entry;
}

/**
 * Where /callback sends the browser/app back to once it's done. Deliberately
 * a closed choice between two server-configured URLs (FRONTEND_URL or
 * NATIVE_APP_SCHEME) rather than trusting a client-supplied redirect target
 * — accepting an arbitrary redirect URL from the request would be an open
 * redirect vulnerability.
 */
export function finalRedirectBase(platform: OAuthPlatform): string {
  if (platform === "native") {
    // e.g. "shift://auth-callback" — the RN app registers this custom
    // scheme and Linking picks it up when the OS opens it.
    return process.env.NATIVE_APP_SCHEME ?? "shift://auth-callback";
  }
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
  return `${frontendUrl}/oauth-callback`;
}

export function redirectUri(provider: string): string {
  const base = process.env.OAUTH_REDIRECT_BASE_URL ?? "http://localhost:3000";
  return `${base}/v1/auth/oauth/${provider}/callback`;
}

export function buildAuthorizeUrl(provider: string, config: OAuthProviderConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId ?? "",
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: config.scope,
    state,
  });
  if (provider === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "consent"); // ensures a refresh_token is returned even on repeat logins
  }
  return `${config.authorizeUrl}?${params.toString()}`;
}

export async function exchangeCodeForToken(provider: string, config: OAuthProviderConfig, code: string) {
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.clientId ?? "",
      client_secret: config.clientSecret ?? "",
      code,
      redirect_uri: redirectUri(provider),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; id_token?: string }>;
}

export async function fetchProfile(config: OAuthProviderConfig, accessToken: string) {
  const res = await fetch(config.userinfoUrl, {
    headers: { authorization: `Bearer ${accessToken}`, "user-agent": "shift-backend" },
  });
  if (!res.ok) throw new Error(`Userinfo fetch failed: ${res.status}`);
  const raw = await res.json();
  return config.extractProfile(raw);
}
