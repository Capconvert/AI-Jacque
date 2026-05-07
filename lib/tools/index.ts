import type Anthropic from '@anthropic-ai/sdk';
import { ahrefsToolDefinitions } from './ahrefs';
import { ga4ToolDefinitions } from './ga4';
import { googleAdsToolDefinitions } from './google-ads';
import { webToolDefinitions } from './web';
import { pagespeedToolDefinitions } from './pagespeed';
import type { ClientToolContext, ToolDefinition } from './types';

export type { ClientToolContext } from './types';

const ALL_TOOLS: ToolDefinition[] = [
  ...ahrefsToolDefinitions,
  ...ga4ToolDefinitions,
  ...googleAdsToolDefinitions,
  ...webToolDefinitions,
  ...pagespeedToolDefinitions,
];

const TOOL_MAP: Map<string, ToolDefinition> = new Map(ALL_TOOLS.map((t) => [t.spec.name, t]));

export function toolSpecs(): Anthropic.Tool[] {
  return ALL_TOOLS.map((t) => t.spec);
}

export interface ToolDispatchResult {
  name: string;
  ok: boolean;
  result: unknown;
  ms: number;
}

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ClientToolContext | null
): Promise<ToolDispatchResult> {
  const start = Date.now();
  const def = TOOL_MAP.get(name);
  if (!def) {
    return { name, ok: false, result: { error: `Unknown tool: ${name}` }, ms: 0 };
  }
  try {
    const result = await def.handler(input, ctx);
    return { name, ok: true, result, ms: Date.now() - start };
  } catch (err) {
    return {
      name,
      ok: false,
      result: { error: err instanceof Error ? err.message : String(err) },
      ms: Date.now() - start,
    };
  }
}
