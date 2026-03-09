import { Elysia, t } from "elysia";
import {
  getOnboardingStatus,
  saveQuestionnaire,
  updateGoal,
  completeOnboarding,
} from "./service";
import { authMiddleware } from "../auth/middleware";

export const onboardingRoutes = new Elysia({ prefix: "/onboarding" })
  .use(authMiddleware)

  // ✅ Status route
  .get(
    "/status",
    async (ctx) => {
      // ctx.user is available and typed from the middleware
      return getOnboardingStatus(ctx.user.id);
    },
    {
      response: t.Object({ isOnboarded: t.Boolean() }),
      detail: { summary: "Get onboarding status", tags: ["Onboarding"] },
    }
  )

  // ✅ Questionnaire route
  .post(
    "/questionnaire",
    async (ctx) => {
      // ctx.body is typed from the body schema below
      return saveQuestionnaire(ctx.user.id, ctx.body);
    },
    {
      body: t.Object({
        objectiveType: t.String(),
        lockdownIntensity: t.String(),
        preferredFocusTime: t.String(),
        socialAccountability: t.String(),
      }),
      response: t.Any(),
      detail: { summary: "Submit onboarding questionnaire", tags: ["Onboarding"] },
    }
  )

  // ✅ Goal route
  .post(
    "/goal",
    async (ctx) => {
      return updateGoal(ctx.user.id, ctx.body.currentObjectiveText);
    },
    {
      body: t.Object({ currentObjectiveText: t.String() }),
      response: t.Any(),
      detail: { summary: "Update onboarding goal", tags: ["Onboarding"] },
    }
  )

  // ✅ Complete onboarding
  .post(
    "/complete",
    async (ctx) => {
      return completeOnboarding(ctx.user.id);
    },
    {
      response: t.Object({ success: t.Boolean() }),
      detail: { summary: "Complete onboarding", tags: ["Onboarding"] },
    }
  );