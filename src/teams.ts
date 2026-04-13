import { TeamsActivityHandler, TurnContext, CardFactory, MessageFactory } from "botbuilder";
import type { Config } from "./config.js";
import { runAgentLoop } from "./llm.js";
import { getHistory, saveHistory } from "./memory.js";

function getUserId(context: TurnContext): string {
  // Use a teams_ prefix to isolate from Telegram users, tying this to the specific channel account ID.
  return `teams_${context.activity.from.id}`;
}

export class NYNTeamsBot extends TeamsActivityHandler {
  private config: Config;

  constructor(config: Config) {
    super();
    this.config = config;

    // Handle normal messages
    this.onMessage(async (context, next) => {
      // Remove bot mention from text so it doesn't feed into transcription
      TurnContext.removeRecipientMention(context.activity);
      
      let text = context.activity.text?.trim() || "";

      // If user sends an empty message, ignore
      if (!text) {
        await next();
        return;
      }

      await context.sendActivity({ type: "typing" });
      const userId = getUserId(context);
      
      const history = getHistory(userId);
      history.push({ role: "user", content: text });
      saveHistory(userId, history);

      try {
        const response = await runAgentLoop(this.config, history);
        history.push({ role: "assistant", content: response.text });
        saveHistory(userId, history);

        // Does the response look like markdown or text? 
        // Teams supports markdown.
        await context.sendActivity(MessageFactory.text(response.text));

        // Note: For advanced adaptive cards, we could check if our loop generated specific tool usage signaling a card.
        // Or if response.text contains JSON, etc.
        // For now, pure text fallback always works.
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        history.pop();
        saveHistory(userId, history);
        console.error("Teams logic error:", msg);
        await context.sendActivity(`⚠️ Error: ${msg.slice(0, 200)}`);
      }

      await next();
    });

    // Handle Meeting notifications / Meeting start
    this.onTeamsMeetingStartEvent(async (meeting, context, next) => {
      await context.sendActivity("🤖 NYN joined the meeting. Let me know if you need assistance during the call!");
      await next();
    });
  }
}

