import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { getToolDefinitions, executeTool } from "./tools/index.js";
import { loadKnowledge } from "./knowledge.js";

// Load soul.md from project root
function loadSoul(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const soulPath = resolve(__dirname, "..", "soul.md");

  try {
    const soul = readFileSync(soulPath, "utf-8").trim();
    console.log(`✅ Soul loaded (soul.md)`);
    return soul;
  } catch {
    console.warn(`⚠️  soul.md not found at ${soulPath}, using fallback prompt`);
    return "You are NYN, a helpful private AI assistant. Be direct and concise.";
  }
}

// Build full system prompt: soul + knowledge base
function buildSystemPrompt(): string {
  const soul = loadSoul();
  const knowledge = loadKnowledge();

  if (!knowledge) {
    return soul;
  }

  return `${soul}

---

## Your Knowledge Base

The following is background information you should use when answering questions. Reference this naturally — don't mention that you're reading from a knowledge base.

${knowledge}`;
}

const SYSTEM_PROMPT = buildSystemPrompt();

export interface AgentResponse {
  text: string;
  toolsUsed: string[];
  iterations: number;
}

/**
 * Run the agentic tool loop via OpenRouter (OpenAI-compatible API):
 * 1. Send message to LLM with available tools
 * 2. If LLM wants to use a tool, execute it and feed result back
 * 3. Repeat until LLM gives a final text response (or hits iteration limit)
 */
export async function runAgentLoop(
  config: Config,
  conversationHistory: ChatCompletionMessageParam[],
  streamCallback?: (chunk: string) => void
): Promise<AgentResponse> {
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: config.openRouterApiKey,
  });

  const tools = getToolDefinitions();
  const toolsUsed: string[] = [];

  // Build messages array with system prompt
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory,
  ];

  let iterations = 0;

  while (iterations < config.maxToolIterations) {
    iterations++;

    if (streamCallback) {
      const stream = await client.chat.completions.create({
        model: config.openRouterModelId,
        max_tokens: 4096,
        tools,
        messages,
        stream: true,
      });

      let contentStr = "";
      const toolCallsMap = new Map<number, any>();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          contentStr += delta.content;
          streamCallback(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index;
            if (!toolCallsMap.has(index)) {
              toolCallsMap.set(index, {
                id: tc.id,
                type: "function",
                function: { name: tc.function?.name || "", arguments: "" },
              });
            }
            if (tc.function?.arguments) {
              toolCallsMap.get(index).function.arguments += tc.function.arguments;
            }
          }
        }
      }

      const tool_calls = Array.from(toolCallsMap.values());
      const message: any = { role: "assistant", content: contentStr || null };
      if (tool_calls.length > 0) message.tool_calls = tool_calls;

      if (!tool_calls || tool_calls.length === 0) {
        return { text: message.content || "(No response)", toolsUsed, iterations };
      }

      messages.push(message);

      for (const toolCall of tool_calls) {
        const functionName = toolCall.function.name;
        let args: Record<string, unknown> = {};

        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          args = {};
        }

        console.log(`🔧 Tool call: ${functionName}(${JSON.stringify(args)})`);
        toolsUsed.push(functionName);

        const result = await executeTool(functionName, args);
        console.log(`   ✅ Result: ${result.success ? "success" : "error"}`);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    } else {
      const response = await client.chat.completions.create({
        model: config.openRouterModelId,
        max_tokens: 4096,
        tools,
        messages,
      });

      const choice = response.choices[0];
      if (!choice) {
        return { text: "(No response from model)", toolsUsed, iterations };
      }

      const message = choice.message;
      const toolCalls = message.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        return { text: message.content || "(No response)", toolsUsed, iterations };
      }

      messages.push(message);

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        let args: Record<string, unknown> = {};

        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          args = {};
        }

        console.log(`🔧 Tool call: ${functionName}(${JSON.stringify(args)})`);
        toolsUsed.push(functionName);

        const result = await executeTool(functionName, args);
        console.log(`   ✅ Result: ${result.success ? "success" : "error"}`);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }
  }

  console.warn(`⚠️  Hit max tool iterations (${config.maxToolIterations})`);
  return {
    text: "I hit my tool iteration limit. Here's what I gathered so far — could you rephrase or simplify your request?",
    toolsUsed,
    iterations,
  };
}
