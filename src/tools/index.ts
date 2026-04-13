/**
 * Tool registry — central place to register all tools available to the agent.
 *
 * Each tool module exports:
 *   - definition: the OpenAI-format tool schema
 *   - handler: async function that executes the tool
 */

import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

export type ToolResult = {
  success: boolean;
  result?: unknown;
  error?: string;
};

export type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

interface RegisteredTool {
  definition: ChatCompletionTool;
  handler: ToolHandler;
}

import * as timeTool from "./time.js";
import * as tdeTool from "./queryTde.js";

// --- Registry ---
const tools: Map<string, RegisteredTool> = new Map();

function register(def: ChatCompletionTool, handler: ToolHandler) {
  const name = def.function.name;
  if (tools.has(name)) {
    throw new Error(`Duplicate tool registration: "${name}"`);
  }
  tools.set(name, { definition: def, handler });
}

// Register all tools
register(timeTool.definition, timeTool.handler);
register(tdeTool.definition, tdeTool.handler);

/** Get all tool definitions for the OpenAI-compatible API call */
export function getToolDefinitions(): ChatCompletionTool[] {
  return Array.from(tools.values()).map((t) => t.definition);
}

/** Execute a tool by name. Returns error result if tool not found. */
export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const tool = tools.get(name);
  if (!tool) {
    return { success: false, error: `Unknown tool: "${name}"` };
  }

  try {
    return await tool.handler(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Tool "${name}" threw:`, message);
    return { success: false, error: `Tool execution failed: ${message}` };
  }
}

/** List registered tool names (for logging) */
export function getToolNames(): string[] {
  return Array.from(tools.keys());
}
