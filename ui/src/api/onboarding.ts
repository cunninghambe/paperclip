import { api } from "./client.js";

// Types
export interface OnboardingStartResponse {
  sessionId: string;
}

export interface OnboardingMessageResponse {
  response: string;
  stage: "greeting" | "industry" | "goals" | "tools" | "sizing" | "complete";
  isComplete: boolean;
}

export interface OnboardingSessionResponse {
  id: string;
  userId: string;
  status: string;
  discoveryData: Record<string, unknown> | null;
  recommendationData: {
    templateKey: string;
    companyName: string;
    agents: Array<{
      slug: string;
      name: string;
      role: string;
      adapterType: string;
      skills: string[];
      reportsToSlug: string | null;
    }>;
    orgChart: string;
  } | null;
  companyId: string | null;
}

export interface OnboardingProvisionResponse {
  companyId: string;
  companyPrefix: string;
}

// Export object
export const onboardingApi = {
  start: () => api.post<OnboardingStartResponse>("/onboarding/start", {}),
  sendMessage: (sessionId: string, message: string) =>
    api.post<OnboardingMessageResponse>(`/onboarding/${sessionId}/message`, { message }),
  getSession: (sessionId: string) =>
    api.get<OnboardingSessionResponse>(`/onboarding/${sessionId}`),
  provision: (sessionId: string, companyName?: string, coordinationMode?: string) =>
    api.post<OnboardingProvisionResponse>(`/onboarding/${sessionId}/provision`, {
      companyName,
      coordinationMode,
    }),
};
