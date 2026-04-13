import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { ToolHandler } from "./index.js";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const BASE_DIR = "C:\\Users\\steve\\Documents";

export const definition: ChatCompletionTool = {
  type: "function",
  function: {
    name: "list_documents",
    description: "Lists files and directories in the user's Documents folder. Can take an optional sub-directory path.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional relative path inside the Documents folder to list.",
        },
      },
      required: [],
    },
  },
};

export const handler: ToolHandler = async (input: Record<string, unknown>) => {
  const relPath = (input.path as string) || "";
  const targetPath = resolve(BASE_DIR, relPath);

  // Security check to prevent path traversal
  if (!targetPath.toLowerCase().startsWith(BASE_DIR.toLowerCase())) {
    return { success: false, error: "Access denied. Path is outside the Documents directory." };
  }

  try {
    const entries = await readdir(targetPath);
    const result = [];
    
    for (const entry of entries) {
      try {
        const stats = await stat(join(targetPath, entry));
        result.push({
          name: entry,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
        });
      } catch (err) {
        // Skip files we can't stat
      }
    }

    return {
      success: true,
      result: {
        path: targetPath,
        files: result,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to list directory: ${msg}`,
    };
  }
};
