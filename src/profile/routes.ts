import { Elysia, t } from "elysia";
import { getPublicProfile, getMyProfile, updateMyProfile } from "./service";
import { authMiddleware } from "../auth/middleware";

export const profileRoutes = new Elysia({ prefix: "/profile" })
  .get("/:username", async ({ params }) => getPublicProfile(params.username), {
    params: t.Object({ username: t.String() }),
    response: t.Any(),
    detail: { summary: "Get public profile", tags: ["Profile"] },
  })
  .use(authMiddleware)
  .get("/me", async ({ user }) => getMyProfile(user.id), {
    response: t.Any(),
    detail: { summary: "Get my profile", tags: ["Profile"] },
  })
  .put("/me", async ({ user, body }) => updateMyProfile(user.id, body), {
    body: t.Object({
      displayName: t.String(),
      bio: t.String(),
      avatarUrl: t.Optional(t.String()),
    }),
    response: t.Any(),
    detail: { summary: "Update my profile", tags: ["Profile"] },
  });
// ...other endpoints (settings, stats, streak, sessions, heatmap, avatar upload) to be implemented
