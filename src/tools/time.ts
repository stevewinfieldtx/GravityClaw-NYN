import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { ToolHandler } from "./index.js";

export const definition: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_current_time",
    description:
      "Returns the current date and time in the user's local timezone. Use this when the user asks what time it is, or when you need to know the current date/time for context.",
    parameters: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description:
            'IANA timezone string (e.g. "America/New_York", "Asia/Bangkok"). Defaults to system timezone if not provided.',
        },
      },
      required: [],
    },
  },
};

export const handler: ToolHandler = async (input: Record<string, unknown>) => {
  const tz = (input.timezone as string) || Intl.DateTimeFormat().resolvedOptions().timeZone;

  try {
    const now = new Date();
    const formatted = now.toLocaleString("en-US", {
      timeZone: tz,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });

    return {
      success: true,
      result: {
        formatted,
        iso: now.toISOString(),
        timezone: tz,
        unix: Math.floor(now.getTime() / 1000),
      },
    };
  } catch {
    return {
      success: false,
      error: `Invalid timezone: "${tz}". Use IANA format like "America/New_York".`,
    };
  }
};
