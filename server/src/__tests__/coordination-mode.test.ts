/**
 * Tests for coordination-mode.ts
 */

import { describe, expect, it } from "vitest";
import {
  resolveCoordinationMode,
  normalizeModelName,
  MODEL_CAPABILITY,
  SELF_ORG_THRESHOLD,
} from "../services/coordination-mode.js";

describe("resolveCoordinationMode", () => {
  it("returns 'structured' when company mode is 'structured'", () => {
    expect(resolveCoordinationMode("structured", ["claude-opus-4-6"])).toBe("structured");
  });

  it("returns 'structured' when company mode is 'structured' regardless of agent models", () => {
    expect(resolveCoordinationMode("structured", ["gpt-5", "claude-opus-4-6"])).toBe("structured");
  });

  it("returns 'sequential' when company mode is 'sequential'", () => {
    expect(resolveCoordinationMode("sequential", ["glm-5"])).toBe("sequential");
  });

  it("returns 'sequential' when company mode is 'sequential' regardless of agent models", () => {
    expect(resolveCoordinationMode("sequential", ["unknown-model"])).toBe("sequential");
  });

  it("returns 'sequential' when auto + all agents above threshold (claude-opus-4-6)", () => {
    expect(resolveCoordinationMode("auto", ["claude-opus-4-6"])).toBe("sequential");
  });

  it("returns 'sequential' when auto + all agents above threshold (multiple models)", () => {
    expect(resolveCoordinationMode("auto", ["claude-opus-4-6", "gpt-5", "claude-sonnet-4-6"])).toBe("sequential");
  });

  it("returns 'structured' when auto + any agent below threshold (glm-5)", () => {
    expect(resolveCoordinationMode("auto", ["claude-opus-4-6", "glm-5"])).toBe("structured");
  });

  it("returns 'structured' when auto + unknown model (conservative default)", () => {
    expect(resolveCoordinationMode("auto", ["totally-unknown-model"])).toBe("structured");
  });

  it("returns 'structured' when auto + empty agent list", () => {
    // No agents = can't self-organize → conservative structured mode
    expect(resolveCoordinationMode("auto", [])).toBe("structured");
  });

  it("normalizes model names with provider prefixes in auto mode", () => {
    expect(resolveCoordinationMode("auto", ["anthropic/claude-opus-4-6"])).toBe("sequential");
  });

  it("normalizes model names case-insensitively in auto mode", () => {
    expect(resolveCoordinationMode("auto", ["anthropic/Claude-Opus-4-6"])).toBe("sequential");
  });

  it("returns 'structured' when auto + single agent below threshold", () => {
    expect(resolveCoordinationMode("auto", ["gemini-3-flash"])).toBe("sequential"); // 72 >= 70
    expect(resolveCoordinationMode("auto", ["glm-5"])).toBe("structured"); // 55 < 70
  });
});

describe("normalizeModelName", () => {
  it("strips provider prefix", () => {
    expect(normalizeModelName("anthropic/claude-opus-4-6")).toBe("claude-opus-4-6");
  });

  it("lowercases the result", () => {
    expect(normalizeModelName("Claude-Opus-4-6")).toBe("claude-opus-4-6");
  });

  it("handles no prefix", () => {
    expect(normalizeModelName("gpt-5")).toBe("gpt-5");
  });

  it("handles openai/ prefix", () => {
    expect(normalizeModelName("openai/gpt-5")).toBe("gpt-5");
  });

  it("handles empty string", () => {
    expect(normalizeModelName("")).toBe("");
  });

  it("handles model with no prefix but uppercase", () => {
    expect(normalizeModelName("GPT-5")).toBe("gpt-5");
  });
});

describe("MODEL_CAPABILITY registry", () => {
  it("has SELF_ORG_THRESHOLD set to 70", () => {
    expect(SELF_ORG_THRESHOLD).toBe(70);
  });

  it("has claude-sonnet-4-6 at or above threshold", () => {
    expect(MODEL_CAPABILITY["claude-sonnet-4-6"]).toBeGreaterThanOrEqual(SELF_ORG_THRESHOLD);
  });

  it("has claude-opus-4-6 at or above threshold", () => {
    expect(MODEL_CAPABILITY["claude-opus-4-6"]).toBeGreaterThanOrEqual(SELF_ORG_THRESHOLD);
  });

  it("has glm-5 below threshold", () => {
    expect(MODEL_CAPABILITY["glm-5"]).toBeLessThan(SELF_ORG_THRESHOLD);
  });
});
