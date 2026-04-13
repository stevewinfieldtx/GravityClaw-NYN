import sqlite3, { Database } from "better-sqlite3";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "..", "data");

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

export const db: Database = sqlite3(resolve(dataDir, "memory.sqlite"));

// Initialize conversation memory table
db.exec(`
  CREATE TABLE IF NOT EXISTS conversation_memory (
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_call_id TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_conversation_memory_user_id ON conversation_memory(user_id, timestamp ASC);
`);

/**
 * Retrieve conversation history for a given user identifier.
 * Because SQLite stores JSON for tool calls in content or separate rows,
 * we keep it simple here by serializing ChatCompletionMessageParam as JSON in the \`content\` field 
 * if role is 'assistant' and has tool calls, or just extracting it fully.
 */

// Let's modify the schema slightly to store full message payload as JSON.
db.exec(`
  CREATE TABLE IF NOT EXISTS memory_store (
    user_id TEXT NOT NULL,
    payload JSON NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_memory_store_user_id ON memory_store(user_id, timestamp ASC);
`);

const MAX_HISTORY_LENGTH = 40;

/**
 * Retrieves the maximum subset of history limit.
 * @param {string} userId - An abstract user or channel ID (e.g. tg_1234 or teams_5678)
 */
export function getHistory(userId: string): ChatCompletionMessageParam[] {
  const rows = db
    .prepare("SELECT payload FROM memory_store WHERE user_id = ? ORDER BY timestamp ASC")
    .all(userId) as { payload: string }[];

  const history = rows.map((r) => JSON.parse(r.payload) as ChatCompletionMessageParam);
  
  // Return at most MAX_HISTORY_LENGTH items
  return history.slice(-MAX_HISTORY_LENGTH);
}

/**
 * Save history efficiently. Instead of rewriting everything, we can just clear and rewrite, or 
 * incrementally add. For this simple memory, replacing the entire history for a user is easy.
 */
export function saveHistory(userId: string, history: ChatCompletionMessageParam[]): void {
  // Trim the history before saving
  while (history.length > MAX_HISTORY_LENGTH) {
    history.shift();
  }

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM memory_store WHERE user_id = ?").run(userId);
    const insert = db.prepare("INSERT INTO memory_store (user_id, payload) VALUES (?, ?)");
    for (const msg of history) {
      insert.run(userId, JSON.stringify(msg));
    }
  });

  transaction();
}

/**
 * Convenience wrapper to clear history
 */
export function clearHistory(userId: string): void {
  db.prepare("DELETE FROM memory_store WHERE user_id = ?").run(userId);
}
