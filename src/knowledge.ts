import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = resolve(__dirname, "..", "knowledge");

/**
 * Load all .md files from the knowledge/ directory.
 * Returns a combined string with each file's contents separated by headers.
 * Skips README.md.
 */
export function loadKnowledge(): string {
  if (!existsSync(KNOWLEDGE_DIR)) {
    console.warn(`⚠️  knowledge/ directory not found`);
    return "";
  }

  const files = readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .sort();

  if (files.length === 0) {
    console.log(`📚 Knowledge base: empty (add .md files to knowledge/)`);
    return "";
  }

  const sections: string[] = [];
  let totalSize = 0;

  for (const file of files) {
    try {
      const content = readFileSync(join(KNOWLEDGE_DIR, file), "utf-8").trim();
      if (content) {
        sections.push(content);
        totalSize += content.length;
      }
    } catch (err) {
      console.warn(`⚠️  Failed to read knowledge/${file}:`, err);
    }
  }

  console.log(
    `📚 Knowledge base: ${files.length} file(s) loaded (${(totalSize / 1024).toFixed(1)} KB)`
  );

  if (totalSize > 50_000) {
    console.warn(
      `⚠️  Knowledge base is ${(totalSize / 1024).toFixed(0)} KB — consider trimming to stay under 50 KB`
    );
  }

  return sections.join("\n\n---\n\n");
}
