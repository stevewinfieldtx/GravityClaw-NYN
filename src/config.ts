import "dotenv/config";

/** Validated, typed configuration loaded from environment variables. */
export interface Config {
  telegramBotToken: string;
  allowedUserIds: Set<number>;
  openRouterApiKey: string;
  openRouterModelId: string;
  groqApiKey: string;
  elevenLabsApiKey: string | null;
  elevenLabsVoiceId: string;
  maxToolIterations: number;
  teamsAppId: string | null;
  teamsAppPassword: string | null;
  teamsPort: number;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`❌ Missing required environment variable: ${key}`);
    console.error(`   Copy .env.example to .env and fill in your values.`);
    process.exit(1);
  }
  return value;
}

function parseUserIds(raw: string): Set<number> {
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);

  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0) {
      console.error(`❌ Invalid Telegram user ID: "${id}". Must be a positive integer.`);
      process.exit(1);
    }
  }

  if (ids.length === 0) {
    console.error(`❌ ALLOWED_USER_IDS must contain at least one user ID.`);
    process.exit(1);
  }

  return new Set(ids);
}

export function loadConfig(): Config {
  return {
    telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
    allowedUserIds: parseUserIds(requireEnv("ALLOWED_USER_IDS")),
    openRouterApiKey: requireEnv("OPENROUTER_API_KEY"),
    openRouterModelId: process.env.OPENROUTER_MODEL_ID ?? "anthropic/claude-sonnet-4",
    groqApiKey: requireEnv("GROQ_API_KEY"),
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || null,
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM",
    maxToolIterations: Math.max(1, parseInt(process.env.MAX_TOOL_ITERATIONS ?? "10", 10)),
    teamsAppId: process.env.TEAMS_APP_ID || null,
    teamsAppPassword: process.env.TEAMS_APP_PASSWORD || null,
    teamsPort: parseInt(process.env.TEAMS_PORT ?? "3978", 10),
  };
}
