import { Elysia } from "elysia";
import { swaggerPlugin } from "./src/docs/swagger";
import { authRoutes } from "./src/auth/routes";
import { onboardingRoutes } from "./src/onboarding/routes";
import { profileRoutes } from "./src/profile/routes";
import { jwt } from "@elysiajs/jwt";
import { cors } from "@elysiajs/cors";
// import { t } from "@elysiajs/validator";
import dotenv from "dotenv";

dotenv.config();

const app = new Elysia()
  .use(
    cors({
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
    }),
  )
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
      exp: "15m",
    }),
  )
  .use(swaggerPlugin)
  .use(authRoutes)
  .use(onboardingRoutes)
  .use(profileRoutes)
  .get("/", () => "Shift backend running!");

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Shift backend running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/docs`);
});

export type ShiftApp = typeof app;
