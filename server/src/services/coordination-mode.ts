/**
 * Coordination Mode Resolver
 *
 * Resolves effective coordination mode for issue creation.
 * "auto" checks model capabilities of active agents against a threshold.
 */

// SWE-bench Verified approximate scores — used for auto-mode resolution
export const MODEL_CAPABILITY: Record<string, number> = {
  "claude-sonnet-4-6": 85,
  "claude-opus-4": 90,
  "claude-opus-4-6": 90,
  "gpt-5": 88,
  "gpt-4o": 76,
  "deepseek-v3": 80,
  "deepseek-v3.2": 82,
  "qwen-3.6-plus": 78,
  "gemini-3-flash": 72,
  "gemini-3-pro": 80,
  "glm-5": 55,
};

export const SELF_ORG_THRESHOLD = 70;

export type CoordinationMode = "structured" | "sequential" | "auto";
export type ResolvedCoordinationMode = "structured" | "sequential";

/**
 * Resolve the effective coordination mode for a company.
 *
 * @param companyMode - The company's coordination mode setting
 * @param agentModels - Array of model names from active agents
 * @returns The resolved coordination mode (structured or sequential)
 */
export function resolveCoordinationMode(
  companyMode: CoordinationMode,
  agentModels: string[],
): ResolvedCoordinationMode {
  if (companyMode === "structured") return "structured";
  if (companyMode === "sequential") return "sequential";

  // Auto mode: check all agent models against threshold
  // Empty agent list = no capable agents to self-organize → structured
  if (agentModels.length === 0) return "structured";

  const allCapable = agentModels.every((model) => {
    const normalized = normalizeModelName(model);
    const score = MODEL_CAPABILITY[normalized] ?? 50; // Unknown = conservative
    return score >= SELF_ORG_THRESHOLD;
  });

  return allCapable ? "sequential" : "structured";
}

/**
 * Normalize a model name by stripping provider prefixes and lowercasing.
 *
 * @param model - The raw model name (may include provider prefix)
 * @returns Normalized model name
 *
 * @example
 * normalizeModelName("anthropic/claude-opus-4-6") // => "claude-opus-4-6"
 * normalizeModelName("Claude-Opus-4-6") // => "claude-opus-4-6"
 */
export function normalizeModelName(model: string): string {
  // Strip provider prefixes (e.g., "anthropic/claude-opus-4-6" → "claude-opus-4-6")
  const parts = model.split("/");
  return parts[parts.length - 1]!.toLowerCase();
}
