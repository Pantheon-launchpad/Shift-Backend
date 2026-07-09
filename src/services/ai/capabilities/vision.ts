import { AICapabilityNotImplementedError } from "../types";

export interface AnalyzeImageInput {
  imageUrl: string;
  prompt: string;
}

export interface AnalyzeImageOutput {
  description: string;
}

/**
 * Placeholder. Both NVIDIA and Anthropic have vision-capable models
 * available under this same provider account — wiring this up later is a
 * matter of adding an `analyzeImage` method to the relevant provider(s) and
 * calling it from here, no architectural change needed.
 */
export async function analyzeImage(_input: AnalyzeImageInput): Promise<AnalyzeImageOutput> {
  throw new AICapabilityNotImplementedError("vision.analyzeImage");
}
