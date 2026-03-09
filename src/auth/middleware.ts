import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { UnauthorizedError } from "../utils/errors";
import type { User } from "../types";

// This type can be exported for reference, but DO NOT use it as a return type in derive
export type AuthContext = { user: User };

export const authMiddleware = new Elysia({ name: "authMiddleware" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
      exp: "15m",
    })
  )
  // Remove explicit return type – let Elysia infer
  .derive({ as: 'scoped' }, async ({ jwt, request }) => {
    const auth = request.headers.get("authorization");
    if (!auth) throw new UnauthorizedError();

    const token = auth.replace("Bearer ", "");
    const user = await jwt.verify(token);
    if (!user) throw new UnauthorizedError();

    // TypeScript will infer that we return { user: User }
    return { user: user as User };
  });