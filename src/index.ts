import { loadConfig } from "./config.js";
import { createBot } from "./bot.js";
import { getToolNames } from "./tools/index.js";

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🛡️  NYN — Private AI Assistant");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log();

  // Load and validate config (exits on failure)
  const config = loadConfig();

  console.log(`✅ Config loaded`);
  console.log(`   Model: ${config.openRouterModelId} (via OpenRouter)`);
  console.log(`   Allowed users: ${[...config.allowedUserIds].join(", ")}`);
  console.log(`   Max tool iterations: ${config.maxToolIterations}`);
  console.log(`   Registered tools: ${getToolNames().join(", ")}`);
  console.log(`   🎙️ Whisper: ✅ enabled`);
  console.log(`   🔊 TTS: ${config.elevenLabsApiKey ? "✅ ElevenLabs" : "❌ not configured (text replies only)"}`);
  console.log();

  // Create and start bot (long-polling, no web server)
  const bot = createBot(config);

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n🛑 Shutting down...");
    bot.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Handle uncaught errors
  bot.catch((err) => {
    console.error("❌ Bot error:", err.message);
  });

  console.log("🚀 Starting Telegram long-polling...");
  console.log("   (No web server, no exposed ports)");
  console.log();

  await bot.start({
    onStart: (botInfo) => {
      console.log(`✅ Bot online as @${botInfo.username}`);
      console.log(`   Send /start in Telegram to begin.`);
      console.log();
    },
  });
}

main().catch((err) => {
  console.error("💀 Fatal error:", err);
  process.exit(1);
});
