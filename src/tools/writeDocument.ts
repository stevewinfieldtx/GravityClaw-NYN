import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { ToolHandler } from "./index.js";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE_DIR = "C:\\Users\\steve\\Documents";

export const definition: ChatCompletionTool = {
  type: "function",
  function: {
    name: "write_document",
    description: "Writes content to a file in the user's Documents folder. Useful for creating notes or saving information.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path to the file inside the Documents folder.",
        },
        content: {
          type: "string",
          description: "The string content to write to the file.",
        },
      },
      required: ["path", "content"],
    },
  },
};

export const handler: ToolHandler = async (input: Record<string, unknown>) => {
  const relPath = input.path as string;
  const content = input.content as string;

  if (!relPath || typeof content !== "string") {
    return { success: false, error: "Missing or invalid required parameters 'path' and 'content'." };
  }

  const targetPath = resolve(BASE_DIR, relPath);

  // Security check to prevent path traversal
  if (!targetPath.toLowerCase().startsWith(BASE_DIR.toLowerCase())) {
    return { success: false, error: "Access denied. Path is outside the Documents directory." };
  }

  try {
    await writeFile(targetPath, content, "utf-8");
    return {
      success: true,
      result: {
        path: targetPath,
        status: "File written successfully.",
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to write file: ${msg}`,
    };
  }
};
