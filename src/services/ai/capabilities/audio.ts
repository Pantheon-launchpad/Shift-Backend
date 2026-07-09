import { AICapabilityNotImplementedError } from "../types";

export interface GenerateAudioInput {
  prompt: string;
  durationSeconds?: number;
}

export interface GenerateAudioOutput {
  url: string;
}

/** Placeholder — no music/sound-generation provider configured yet. */
export async function generateAudio(_input: GenerateAudioInput): Promise<GenerateAudioOutput> {
  throw new AICapabilityNotImplementedError("audio.generateAudio");
}
