import type { UIAdapterModule } from "../types";
import { parseHermesGatewayStdoutLine } from "@autogeny/adapter-hermes-gateway/ui";
import { buildHermesGatewayConfig } from "@autogeny/adapter-hermes-gateway/ui";
import { HermesGatewayConfigFields } from "./config-fields";

export const hermesGatewayUIAdapter: UIAdapterModule = {
  type: "hermes_gateway",
  label: "Hermes Gateway",
  parseStdoutLine: parseHermesGatewayStdoutLine,
  ConfigFields: HermesGatewayConfigFields,
  buildAdapterConfig: buildHermesGatewayConfig,
};
