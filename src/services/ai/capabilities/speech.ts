import { AICapabilityNotImplementedError } from "../types";

export interface TranscribeInput {
  audioUrl: string;
}
export interface TranscribeOutput {
  text: string;
}

export interface SynthesizeSpeechInput {
  text: string;
  voice?: string;
}
export interface SynthesizeSpeechOutput {
  url: string;
}

/** Placeholder — no speech-to-text provider configured yet. */
export async function transcribe(_input: TranscribeInput): Promise<TranscribeOutput> {
  throw new AICapabilityNotImplementedError("speech.transcribe");
}

/** Placeholder — no text-to-speech provider configured yet. */
export async function synthesizeSpeech(_input: SynthesizeSpeechInput): Promise<SynthesizeSpeechOutput> {
  throw new AICapabilityNotImplementedError("speech.synthesizeSpeech");
}
