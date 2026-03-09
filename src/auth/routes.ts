import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { registerUser, loginUser, getUserById } from "./service";
import { UnauthorizedError, ConflictError } from "../utils/errors"; // we use UnauthorizedError

export const authRoutes = new Elysia({ prefix: "/auth" })
  // Access token plugin (15 min)
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
      exp: "15m",
    })
  )
  // Refresh token plugin (7 days)
  .use(
    jwt({
      name: "refreshJwt",
      secret: process.env.JWT_SECRET!,
      exp: "7d",
    })
  )
  .post(
    "/register",
    async ({ body, jwt, refreshJwt }) => {
      const user = await registerUser(body);
      if (!user) {
        throw new Error("Registration failed"); // or throw ConflictError if appropriate
      }

      const accessToken = await jwt.sign({
        id: user.id,
        email: user.email,
      });

      const refreshToken = await refreshJwt.sign({
        id: user.id,
      });

      return {
        user: { id: user.id, email: user.email, name: user.name ?? "" },
        accessToken,
        refreshToken,
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 6 }),
        name: t.String(),
      }),
      response: t.Object({
        user: t.Object({ id: t.String(), email: t.String(), name: t.String() }),
        accessToken: t.String(),
        refreshToken: t.String(),
      }),
      detail: { summary: "Register", tags: ["Auth"] },
    }
  )
  .post(
    "/login",
    async ({ body, jwt, refreshJwt }) => {
      const user = await loginUser(body);
      // loginUser already throws UnauthorizedError on failure, so no need to check here

      const accessToken = await jwt.sign({
        id: user.id,
        email: user.email,
      });

      const refreshToken = await refreshJwt.sign({
        id: user.id,
      });

      return {
        user: { id: user.id, email: user.email, name: user.name ?? "" },
        accessToken,
        refreshToken,
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 6 }),
      }),
      response: t.Object({
        user: t.Object({ id: t.String(), email: t.String(), name: t.String() }),
        accessToken: t.String(),
        refreshToken: t.String(),
      }),
      detail: { summary: "Login", tags: ["Auth"] },
    }
  )
  .post(
    "/refresh",
    async ({ body, jwt, refreshJwt }) => {
      const { refreshToken } = body;

      const payload = await refreshJwt.verify(refreshToken);
      if (!payload) {
        throw new UnauthorizedError("Invalid or expired refresh token");
      }

      const user = await getUserById(payload.id as string);
      if (!user) {
        throw new UnauthorizedError("User not found");
      }

      // Cast email to string – it's guaranteed by the database schema
      const newAccessToken = await jwt.sign({
        id: user.id,
        email: user.email as string,   // ✅ explicit cast
      });

      const newRefreshToken = await refreshJwt.sign({
        id: user.id,
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    },
    {
      body: t.Object({ refreshToken: t.String() }),
      response: t.Object({
        accessToken: t.String(),
        refreshToken: t.String(),
      }),
      detail: { summary: "Refresh access token", tags: ["Auth"] },
    }
  )