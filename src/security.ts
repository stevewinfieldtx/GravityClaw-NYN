import type { Context, NextFunction } from "grammy";
import type { Config } from "./config.js";

/**
 * Grammy middleware that silently drops messages from unauthorized users.
 * This is the first line of defense — no response, no error, nothing.
 * Attackers don't even know the bot exists.
 */
export function createAuthMiddleware(config: Config) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const userId = ctx.from?.id;

    // No user ID = system message or channel post. Ignore.
    if (!userId) return;

    // Not on the whitelist? Silent drop.
    if (!config.allowedUserIds.has(userId)) {
      // Log for awareness, but never respond
      console.warn(`⚠️  Blocked message from unauthorized user: ${userId}`);
      return;
    }

    // Authorized — continue processing
    await next();
  };
}
