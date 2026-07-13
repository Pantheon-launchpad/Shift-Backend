import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "../db/client";
import { users, refreshTokens, userSettings, streaks, oauthConnections } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { signAccessToken, verifyAccessToken, generateRefreshToken, hashRefreshToken, deviceLabelFromUserAgent } from "../lib/tokens";
import { badRequest, unauthorized, ApiError } from "../lib/errors";
import { requireAuth, getUserId } from "../middleware/auth";
import { PROVIDERS, createState, consumeState, buildAuthorizeUrl, exchangeCodeForToken, fetchProfile, finalRedirectBase } from "../lib/oauth";

export const authRouter = Router();

function serializeUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

async function issueSession(userId: string, deviceLabel: string) {
  const accessToken = signAccessToken(userId);
  const { token: refreshToken, expiresAt } = generateRefreshToken();
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashRefreshToken(refreshToken),
    deviceLabel,
    familyId: randomUUID(),
    expiresAt,
  });
  return { accessToken, refreshToken };
}

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

authRouter.post("/signup", async (req, res, next) => {
  try {
    const body = signupSchema.parse(req.body);
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
    if (existing.length > 0) throw badRequest("EMAIL_TAKEN", "An account with that email already exists.");

    const passwordHash = await bcrypt.hash(body.password, 10);
    const [user] = await db.insert(users).values({ email: body.email, passwordHash, name: body.name }).returning();

    await db.insert(userSettings).values({ userId: user.id });
    await db.insert(streaks).values({ userId: user.id });

    const session = await issueSession(user.id, deviceLabelFromUserAgent(req.headers["user-agent"]));
    res.status(200).json({ user: serializeUser(user), ...session });
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({ email: z.string().email(), password: z.string() });

authRouter.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (!user || !user.passwordHash) throw unauthorized("Invalid email or password.");

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) throw unauthorized("Invalid email or password.");

    const session = await issueSession(user.id, deviceLabelFromUserAgent(req.headers["user-agent"]));
    res.status(200).json({ user: serializeUser(user), ...session });
  } catch (err) {
    next(err);
  }
});

const refreshSchema = z.object({ refreshToken: z.string() });

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokenHash = hashRefreshToken(refreshToken);

    const [record] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
    if (!record) throw unauthorized("Refresh token is invalid.");

    if (record.revokedAt) {
      // Theft-detection: a revoked token being replayed means the whole
      // rotation family may be compromised. Revoke it all and force re-login.
      await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.familyId, record.familyId));
      throw unauthorized("This session was revoked. Please log in again.");
    }
    if (record.expiresAt < new Date()) throw unauthorized("Refresh token has expired.");

    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, record.id));

    const accessToken = signAccessToken(record.userId);
    const { token: newRefreshToken, expiresAt } = generateRefreshToken();
    await db.insert(refreshTokens).values({
      userId: record.userId,
      tokenHash: hashRefreshToken(newRefreshToken),
      deviceLabel: record.deviceLabel,
      familyId: record.familyId,
      expiresAt,
    });

    res.status(200).json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokenHash = hashRefreshToken(refreshToken);
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, tokenHash));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, userId));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

authRouter.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (user) {
      // In production: generate a reset token, store its hash, email a link.
      // Deliberately not implemented here (needs an email provider); always
      // 204 either way so this never leaks whether the email exists.
      console.log(`[stub] would email a password reset link to ${email}`);
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

authRouter.post("/reset-password", async (req, res, next) => {
  try {
    z.object({ token: z.string(), newPassword: z.string().min(8) }).parse(req.body);
    // Stub: wire up once forgot-password issues real tokens.
    throw new ApiError(501, "NOT_IMPLEMENTED", "Password reset requires an email provider; not wired up in this MVP.");
  } catch (err) {
    next(err);
  }
});

authRouter.post("/verify-email", async (req, res, next) => {
  try {
    z.object({ token: z.string() }).parse(req.body);
    throw new ApiError(501, "NOT_IMPLEMENTED", "Email verification requires an email provider; not wired up in this MVP.");
  } catch (err) {
    next(err);
  }
});

const OAUTH_PROVIDERS = ["github", "google", "figma"];

authRouter.get("/oauth/:provider/start", async (req, res, next) => {
  try {
    const provider = req.params.provider;
    if (!OAUTH_PROVIDERS.includes(provider)) throw badRequest("UNKNOWN_PROVIDER", "Unknown OAuth provider.");

    const config = PROVIDERS[provider];
    if (!config.clientId || !config.clientSecret) {
      throw new ApiError(501, "NOT_IMPLEMENTED", `${provider} OAuth isn't configured — set its client id/secret env vars.`);
    }

    // "connect" mode: an already-logged-in user linking a new provider from
    // Settings, sends their own Bearer token. "login" mode: signing in with
    // this provider from the logged-out state, no token available yet.
    let userId: string | undefined;
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      try {
        userId = verifyAccessToken(header.slice("Bearer ".length)).sub;
      } catch {
        // Ignore — falls through to login mode below.
      }
    }

    // Which client started this: the web app (redirect back to FRONTEND_URL)
    // or the React Native app (redirect back to the NATIVE_APP_SCHEME deep
    // link instead). Defaults to "web" so existing callers don't need to change.
    const platformParam = typeof req.query.platform === "string" ? req.query.platform : "web";
    if (platformParam !== "web" && platformParam !== "native") {
      throw badRequest("INVALID_PLATFORM", 'platform must be "web" or "native".');
    }

    const state = createState(userId ? "connect" : "login", platformParam, userId);
    res.redirect(buildAuthorizeUrl(provider, config, state));
  } catch (err) {
    next(err);
  }
});

authRouter.get("/oauth/:provider/callback", async (req, res, next) => {
  try {
    const provider = req.params.provider;
    if (!OAUTH_PROVIDERS.includes(provider)) throw badRequest("UNKNOWN_PROVIDER", "Unknown OAuth provider.");

    const config = PROVIDERS[provider];
    if (!config.clientId || !config.clientSecret) {
      throw new ApiError(501, "NOT_IMPLEMENTED", `${provider} OAuth isn't configured — set its client id/secret env vars.`);
    }

    const { code, state, error: providerError } = req.query as Record<string, string>;

    // Consumed first, before branching on anything else, so every redirect
    // below — including the provider-denied-consent case — knows whether to
    // send the user back to the web app or the native app's deep link.
    // Falls back to "web" if state is missing/invalid/expired, since that's
    // the safer universal default when we can't tell which client asked.
    const stateEntry = state ? consumeState(state) : null;
    const redirectBase = finalRedirectBase(stateEntry?.platform ?? "web");

    if (providerError) {
      res.redirect(`${redirectBase}?error=${encodeURIComponent(providerError)}`);
      return;
    }
    if (!code || !state) throw badRequest("MISSING_CODE", "Missing code or state from provider callback.");
    if (!stateEntry) throw unauthorized("OAuth state is invalid or expired — please try connecting again.");

    const tokenResponse = await exchangeCodeForToken(provider, config, code);
    const profile = await fetchProfile(config, tokenResponse.access_token);
    if (!profile.email) throw badRequest("NO_EMAIL", `${provider} did not return an email address for this account.`);

    if (stateEntry.intent === "connect" && stateEntry.userId) {
      // Linking a provider onto an already-logged-in account (§ Connections).
      await db
        .insert(oauthConnections)
        .values({
          userId: stateEntry.userId,
          provider,
          providerUserId: profile.providerUserId,
          accessTokenEncrypted: tokenResponse.access_token, // TODO: encrypt at rest before production
          refreshTokenEncrypted: tokenResponse.refresh_token ?? null,
        })
        .onConflictDoUpdate({
          target: [oauthConnections.provider, oauthConnections.providerUserId],
          set: { accessTokenEncrypted: tokenResponse.access_token, refreshTokenEncrypted: tokenResponse.refresh_token ?? null },
        });

      // Web: goes to Settings directly, since that's where "connect a
      // provider" is initiated from. Native: reuses the same
      // shift://auth-callback deep link as login, distinguished by the
      // `connected` query param, so the RN app only needs one linking
      // handler instead of a second "settings" deep link route.
      const connectRedirect =
        stateEntry.platform === "native"
          ? `${redirectBase}?connected=${provider}`
          : `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/settings?connected=${provider}`;
      res.redirect(connectRedirect);
      return;
    }

    // Login/signup via provider: find an existing connection, else find-or-create
    // a user by email, then link the connection.
    const [existingConnection] = await db
      .select()
      .from(oauthConnections)
      .where(and(eq(oauthConnections.provider, provider), eq(oauthConnections.providerUserId, profile.providerUserId)))
      .limit(1);

    let userId: string;
    if (existingConnection) {
      userId = existingConnection.userId;
    } else {
      const [existingUser] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
      if (existingUser) {
        userId = existingUser.id;
      } else {
        const [newUser] = await db.insert(users).values({ email: profile.email, name: profile.name, emailVerifiedAt: new Date() }).returning();
        await db.insert(userSettings).values({ userId: newUser.id });
        await db.insert(streaks).values({ userId: newUser.id });
        userId = newUser.id;
      }
      await db.insert(oauthConnections).values({
        userId,
        provider,
        providerUserId: profile.providerUserId,
        accessTokenEncrypted: tokenResponse.access_token,
        refreshTokenEncrypted: tokenResponse.refresh_token ?? null,
      });
    }

    const session = await issueSession(userId, deviceLabelFromUserAgent(req.headers["user-agent"]));

    // Tokens go in the URL fragment (after #), not the query string, so they
    // never hit server logs or Referer headers. Web: the frontend's
    // /oauth-callback route reads window.location.hash and clears it.
    // Native: the RN app's Linking handler for shift://auth-callback reads
    // the same fragment the same way — url.split('#')[1].
    const fragment = new URLSearchParams({ accessToken: session.accessToken, refreshToken: session.refreshToken }).toString();
    res.redirect(`${redirectBase}#${fragment}`);
  } catch (err) {
    next(err);
  }
});
