import pc from "picocolors";

/**
 * Print a hermes-gateway adapter log line to stdout with optional color coding.
 */
export function printHermesGatewayStreamEvent(raw: string, debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  if (!debug) {
    console.log(line);
    return;
  }

  if (line.startsWith("[hermes-gateway:response]")) {
    console.log(pc.cyan(line));
    return;
  }

  if (line.startsWith("[hermes-gateway:error]")) {
    console.log(pc.red(line));
    return;
  }

  if (line.startsWith("[hermes-gateway]")) {
    console.log(pc.blue(line));
    return;
  }

  console.log(pc.gray(line));
}
