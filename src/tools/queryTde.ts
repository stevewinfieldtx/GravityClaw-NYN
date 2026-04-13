import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { ToolHandler } from "./index.js";

export const definition: ChatCompletionTool = {
  type: "function",
  function: {
    name: "query_wintech_knowledge_base",
    description: "Query the WinTech Partners knowledge base via the TDE API. Use this to answer any question about WinTech Partners, its products, services, team, or capabilities.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The user's question to answer.",
        },
        collections: {
          type: "string",
          description: 'Defaults to "WinTechPartners" if omitted.',
        },
      },
      required: ["question"],
    },
  },
};

export const handler: ToolHandler = async (input: Record<string, unknown>) => {
  const question = input.question as string;
  const collections = (input.collections as string) || "WinTechPartners";

  try {
    const response = await fetch("https://targeteddecomposition-production.up.railway.app/agent/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question, collections }),
    });

    if (!response.ok) {
      return { success: false, error: `TDE API request failed with status: ${response.status}` };
    }

    const data = await response.json();
    return { success: true, result: data };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to fetch from TDE API: ${msg}` };
  }
};
