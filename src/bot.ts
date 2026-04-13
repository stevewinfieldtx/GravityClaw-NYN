import { Bot, InputFile } from "grammy";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import type { Config } from "./config.js";
import { createAuthMiddleware } from "./security.js";
import { runAgentLoop } from "./llm.js";
import { transcribeAudio, textToSpeech, downloadTelegramFile } from "./voice.js";
import { getHistory, saveHistory, clearHistory } from "./memory.js";

// Local history implementation removed in favor of memory.js

/**
 * Send the agent's response — as voice if the user spoke, as text otherwise.
 * Falls back to text if TTS fails or isn't configured.
 */
async function sendResponse(
  ctx: any,
  config: Config,
  text: string,
  replyWithVoice: boolean
): Promise<void> {
  // Try voice reply if requested
  if (replyWithVoice) {
    try {
      const audioBuffer = await textToSpeech(config, text);
      if (audioBuffer) {
        await ctx.replyWithVoice(new InputFile(audioBuffer, "response.mp3"));
        // Also send text as a caption/follow-up so they can read it
        if (text.length <= 4096) {
          await ctx.reply(text, { parse_mode: "Markdown" }).catch(() => ctx.reply(text));
        }
        return;
      }
    } catch (err) {
      console.error("❌ TTS failed, falling back to text:", err);
    }
  }

  // Text fallback (or primary for text messages)
  const maxLen = 4096;
  if (text.length <= maxLen) {
    await ctx.reply(text, { parse_mode: "Markdown" }).catch(() => ctx.reply(text));
  } else {
    for (let i = 0; i < text.length; i += maxLen) {
      const chunk = text.slice(i, i + maxLen);
      await ctx.reply(chunk).catch(() => {});
    }
  }
}

export function createBot(config: Config): Bot {
  const bot = new Bot(config.telegramBotToken);

  // Security: whitelist check is the FIRST middleware
  bot.use(createAuthMiddleware(config));

  // /start command
  bot.command("start", async (ctx) => {
    const voiceStatus = config.elevenLabsApiKey ? "✅ enabled" : "❌ not configured";
    await ctx.reply(
      "🛡️ *NYN is online.*\n\n" +
        "I'm your private AI assistant running locally on your machine.\n" +
        "Send me a text or voice message and I'll help.\n\n" +
        `🎙️ Voice replies: ${voiceStatus}\n\n` +
        "Type /clear to reset our conversation.",
      { parse_mode: "Markdown" }
    );
  });

  // /clear command — reset conversation history
  bot.command("clear", async (ctx) => {
    const userId = `tg_${ctx.from!.id}`;
    clearHistory(userId);
    await ctx.reply("🧹 Conversation cleared. Fresh start.");
  });

  // /status command — check bot health
  bot.command("status", async (ctx) => {
    const userId = `tg_${ctx.from!.id}`;
    const history = getHistory(userId);
    await ctx.reply(
      `✅ *NYN Status*\n\n` +
        `• Model: \`${config.openRouterModelId}\`\n` +
        `• Whisper: ✅ enabled\n` +
        `• TTS: ${config.elevenLabsApiKey ? "✅ ElevenLabs" : "❌ not configured"}\n` +
        `• Conversation: ${history.length} messages\n` +
        `• Max tool iterations: ${config.maxToolIterations}\n` +
        `• Mode: Local (long-polling)`,
      { parse_mode: "Markdown" }
    );
  });

  // Handle voice messages
  bot.on("message:voice", async (ctx) => {
    const userId = `tg_${ctx.from!.id}`;

    await ctx.replyWithChatAction("typing");

    try {
      // 1. Download the voice file from Telegram
      const file = await ctx.getFile();
      const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
      console.log(`🎙️ Received voice message from ${userId}, downloading...`);

      const audioBuffer = await downloadTelegramFile(fileUrl);
      console.log(`   Downloaded ${(audioBuffer.length / 1024).toFixed(1)} KB`);

      // 2. Transcribe with Whisper
      console.log(`   Transcribing with Whisper...`);
      const transcription = await transcribeAudio(config, audioBuffer);
      console.log(`   📝 Transcription: "${transcription}"`);

      if (!transcription) {
        await ctx.reply("🤷 I couldn't understand that voice message. Could you try again?");
        return;
      }

      // Show the user what we heard
      await ctx.reply(`🎙️ _"${transcription}"_`, { parse_mode: "Markdown" }).catch(() => {});

      // 3. Feed transcription into the agent loop
      const history = getHistory(userId);
      history.push({ role: "user", content: transcription });
      saveHistory(userId, history);

      await ctx.replyWithChatAction("typing");

      const response = await runAgentLoop(config, history);

      history.push({ role: "assistant", content: response.text });
      saveHistory(userId, history);

      if (response.toolsUsed.length > 0) {
        console.log(
          `📊 Response used ${response.toolsUsed.length} tool(s): ${response.toolsUsed.join(", ")}`
        );
      }

      // 4. Reply with voice + text
      await sendResponse(ctx, config, response.text, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ Voice processing error:`, message);
      await ctx.reply(`⚠️ Voice error: ${message.slice(0, 200)}`);
    }
  });

  // Handle all text messages — the main agent loop
  bot.on("message:text", async (ctx) => {
    const userId = `tg_${ctx.from!.id}`;
    const userMessage = ctx.message.text;

    // Skip if it's a command we already handled
    if (userMessage.startsWith("/")) return;

    const history = getHistory(userId);

    // Add user message to history
    history.push({ role: "user", content: userMessage });
    saveHistory(userId, history);

    // Show typing indicator
    await ctx.replyWithChatAction("typing");

    try {
      // Run the agentic loop
      const response = await runAgentLoop(config, history);

      // Add assistant response to history
      history.push({ role: "assistant", content: response.text });
      saveHistory(userId, history);

      // Log tool usage
      if (response.toolsUsed.length > 0) {
        console.log(
          `📊 Response used ${response.toolsUsed.length} tool(s) in ${response.iterations} iteration(s): ${response.toolsUsed.join(", ")}`
        );
      }

      // Reply with text only
      await sendResponse(ctx, config, response.text, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ Agent loop error:`, message);

      history.pop();
      saveHistory(userId, history);

      await ctx.reply(`⚠️ Error: ${message.slice(0, 200)}`);
    }
  });

  return bot;
}
