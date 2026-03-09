import { db } from "../db/client";
import { users } from "../db/schema/users";
import { UnauthorizedError, ConflictError } from "../utils/errors";
import { hashPassword, verifyPassword } from "./utils";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";

export async function registerUser({
  email,
  password,
  name,
}: {
  email: string;
  password: string;
  name: string;
}) {
  // Check if user exists
  const existing = await db.select().from(users).where(eq(users.email, email));

  if (existing.length > 0) throw new ConflictError("Email already registered");

  const passwordHash = await hashPassword(password);

  const user = await db
    .insert(users)
    .values({
      id: uuidv4(),
      email,
      passwordHash,
      name,
      authProvider: "email",
      createdAt: new Date(),
      updatedAt: new Date(),
      isOnboarded: false,
    })
    .returning();

  return user[0];
}

export async function loginUser({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const user = await db.select().from(users).where(eq(users.email, email));

  if (!user[0] || !user[0].passwordHash)
    throw new UnauthorizedError("Invalid credentials");

  const valid = await verifyPassword(password, user[0].passwordHash);

  if (!valid) throw new UnauthorizedError("Invalid credentials");

  return user[0];
}

// ✅ NEW: Get user by ID (used in /refresh)
export async function getUserById(id: string) {
  const user = await db.select().from(users).where(eq(users.id, id));
  return user[0] || null;
}