import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions.js";
import type { Config } from "./config.js";
import { getToolDefinitions, executeTool } from "./tools/index.js";

const SYSTEM_PROMPT = `You are Sentinel, a personal AI assistant running as a Telegram bot on the user's local machine.

Key traits:
- You are direct, helpful, and security-conscious.
- You have access to tools. Use them when they help answer the user's question.
- If you don't know something and don't have a tool for it, say so honestly.
- Keep responses concise — this is a chat interface, not an essay.
- Use markdown formatting sparingly (Telegram supports basic markdown).

Current capabilities:
- get_current_time: Check the current date and time in any timezone.

You are running locally on the user's machine. Everything stays private.`;

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
  conversationHistory: ChatCompletionMessageParam[]
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

    // Check if the model wants to use tools
    const toolCalls = message.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      // No tool calls — return the text response
      const text = message.content || "(No response)";
      return { text, toolsUsed, iterations };
    }

    // Model wants to use tools — add its response to history
    messages.push(message);

    // Execute each tool and feed results back
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

      // Add tool result as a tool message
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    // Loop back so the model can see the tool results
  }

  // Hit iteration limit
  console.warn(`⚠️  Hit max tool iterations (${config.maxToolIterations})`);
  return {
    text: "I hit my tool iteration limit. Here's what I gathered so far — could you rephrase or simplify your request?",
    toolsUsed,
    iterations,
  };
}
