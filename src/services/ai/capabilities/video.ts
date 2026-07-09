import { AICapabilityNotImplementedError } from "../types";

export interface GenerateVideoInput {
  prompt: string;
  durationSeconds?: number;
}

export interface GenerateVideoOutput {
  url: string;
}

/** Placeholder — no video-generation provider configured yet. */
export async function generateVideo(_input: GenerateVideoInput): Promise<GenerateVideoOutput> {
  throw new AICapabilityNotImplementedError("video.generateVideo");
}
