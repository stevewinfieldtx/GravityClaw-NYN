import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { ToolHandler } from "./index.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE_DIR = "C:\\Users\\steve\\Documents";

export const definition: ChatCompletionTool = {
  type: "function",
  function: {
    name: "read_document",
    description: "Reads the content of a file in the user's Documents folder. Useful for answering questions based on files.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path to the file inside the Documents folder.",
        },
      },
      required: ["path"],
    },
  },
};

export const handler: ToolHandler = async (input: Record<string, unknown>) => {
  const relPath = input.path as string;
  if (!relPath) return { success: false, error: "Missing required parameter 'path'." };

  const targetPath = resolve(BASE_DIR, relPath);

  // Security check to prevent path traversal
  if (!targetPath.toLowerCase().startsWith(BASE_DIR.toLowerCase())) {
    return { success: false, error: "Access denied. Path is outside the Documents directory." };
  }

  try {
    const content = await readFile(targetPath, "utf-8");
    return {
      success: true,
      result: {
        path: targetPath,
        content: content, // Might be long, but we just return it
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to read file: ${msg}`,
    };
  }
};
