// §10: "Upload the resulting PNG to object storage (S3/R2/Supabase Storage),
// store the URL on build_in_public_posts.card_image_url."
//
// No object storage credentials are configured in this environment (§13:
// S3_BUCKET / R2_BUCKET), so this defaults to local disk + static serving
// so the feature is fully functional end-to-end without external deps.
// Swap `uploadPng` for an S3 `PutObjectCommand` call (or R2/Supabase
// equivalent) when those env vars are set — the call site in
// routes/buildInPublic.ts doesn't need to change.

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const STORAGE_DIR = path.join(process.cwd(), "public", "cards");

export async function uploadPng(buffer: Buffer): Promise<string> {
  await mkdir(STORAGE_DIR, { recursive: true });
  const filename = `${randomUUID()}.png`;
  await writeFile(path.join(STORAGE_DIR, filename), buffer);

  const base = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  return `${base}/static/cards/${filename}`;
}
