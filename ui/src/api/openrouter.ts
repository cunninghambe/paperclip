import { api } from "./client.js";

export interface OpenRouterModel {
  id: string;
  label: string;
  free: boolean;
  contextLength: number;
  maxOutput: number;
  promptPrice: number;
  completionPrice: number;
}

export const openRouterApi = {
  models: () => api.get<OpenRouterModel[]>("/openrouter/models"),
};
