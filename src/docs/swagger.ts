import { swagger } from "@elysiajs/swagger";

export const swaggerPlugin = swagger({
  path: "/docs",
  documentation: {
    info: {
      title: "Shift API",
      version: "1.0.0",
      description: "API for Shift – The Mandatory Contract for Execution",
    },
    tags: [
      { name: "Auth", description: "Authentication endpoints" },
      { name: "Onboarding", description: "User onboarding flow" },
      { name: "Profile", description: "User profile and settings" },
    ],
  },
});
