import type Anthropic from '@anthropic-ai/sdk';

export interface ClientToolContext {
  clientId: number;
  clientName: string;
  websiteUrl: string;
  ahrefsProjectId: number | null;
  ga4PropertyId: string | null;
  googleAdsCustomerId: string | null;
}

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ClientToolContext | null
) => Promise<unknown>;

export interface ToolDefinition {
  spec: Anthropic.Tool;
  handler: ToolHandler;
}
