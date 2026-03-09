// Shared TypeScript types for Shift Backend

export type AuthProvider = "email" | "google" | "apple";
export type ProfileVisibility = "public" | "friends" | "private";
export type ObjectiveType = "startup" | "learning" | "content" | "habits";
export type LockdownIntensity = "soft" | "standard" | "hard" | "absolute";
export type FocusTime = "morning" | "afternoon" | "night" | "flexible";
export type SocialAccountability = "public" | "friends" | "private";
export type CoachingStyle = "strict" | "supportive" | "adaptive";
export type SubscriptionTier = "starter" | "pro" | "creator" | "teams";
export type PaymentProvider = "stripe" | "revenuecat";
export type PurchaseItemType = "streak_failsafe" | "hard_lockdown";

export interface User {
  id: string;
  [key: string]: any;
}
