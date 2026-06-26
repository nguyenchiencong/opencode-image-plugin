import type { Plugin } from "@opencode-ai/plugin";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import * as fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, "..", "debug.log");

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // silently ignore log failures — never crash
  }
}

/**
 * Safely stringify a part for logging, truncating large fields like base64 data.
 */
function safeStringify(part: any): string {
  try {
    const clone: any = {};
    for (const key of Object.keys(part)) {
      const val = part[key];
      if (typeof val === "string" && val.length > 200) {
        clone[key] = val.substring(0, 200) + `...[truncated, ${val.length} chars total]`;
      } else {
        clone[key] = val;
      }
    }
    return JSON.stringify(clone);
  } catch {
    return "[failed to stringify]";
  }
}

/**
 * Extract the real absolute path from a FilePart.
 * The source.path field contains the correct original path.
 */
function getRealAbsolutePath(part: any, workspaceDir?: string): string | null {
  if (part.type !== "file") return null;

  // Best source: source.path — this is the original file location
  if (part.source?.path && typeof part.source.path === "string") {
    if (path.isAbsolute(part.source.path)) {
      return part.source.path;
    }
    if (workspaceDir) {
      return path.resolve(workspaceDir, part.source.path);
    }
  }

  // Try url field
  if (part.url && typeof part.url === "string") {
    try {
      if (part.url.startsWith("file://")) {
        return fileURLToPath(part.url);
      }
      if (path.isAbsolute(part.url)) {
        return part.url;
      }
      if (workspaceDir && !part.url.startsWith("data:")) {
        return path.resolve(workspaceDir, part.url);
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

const plugin: Plugin = async ({ client, directory }) => {
  try {
    log("Initializing...");
    log(`Workspace directory: ${directory}`);
  } catch {
    // never crash during init
  }

  return {
    "chat.message": async (input, output) => {
      try {
        log(`--- chat.message hook triggered (session: ${input.sessionID}) ---`);

        if (!output.parts || !Array.isArray(output.parts)) {
          log("No parts in output, skipping.");
          return;
        }

        // Dump all parts for diagnostics (safely, truncating large values)
        for (let i = 0; i < output.parts.length; i++) {
          const p = output.parts[i];
          log(`  part[${i}] type="${p.type}" ${safeStringify(p)}`);
        }

        // 1. Build a filename → absolute path map from file parts
        const fileMappings = new Map<string, string>();

        for (const part of output.parts) {
          if (part.type !== "file") continue;
          const absPath = getRealAbsolutePath(part, directory);
          if (!absPath) {
            log(`Could not resolve path for file part: ${safeStringify(part)}`);
            continue;
          }

          const filename = (part as any).filename || path.basename(absPath);
          if (fileMappings.has(filename)) {
            log(`Warning: duplicate filename "${filename}", overwriting`);
          }
          fileMappings.set(filename, absPath);
          log(`Mapped "${filename}" → "${absPath}"`);
        }

        if (fileMappings.size === 0) {
          log("No file mappings found.");
          return;
        }

        // 2. Fix ONLY the first non-synthetic text part (the user's actual message).
        //    Append absolute path information so the LLM/subagent gets the correct path.
        //    Do NOT touch synthetic parts or file part URLs — that causes 400 errors.
        for (const part of output.parts) {
          if (part.type !== "text" || !(part as any).text) continue;
          // Skip synthetic parts — modifying them may break OpenCode internals
          if ((part as any).synthetic) continue;

          const original = (part as any).text as string;
          let updated = original;

          // Replace markdown image/link references if any
          updated = updated.replace(
            /(!?)\[([^\]]*)\]\(([^)]+)\)/g,
            (match: string, bang: string, label: string, url: string) => {
              const filename = path.basename(url);
              const absPath = fileMappings.get(filename);
              if (absPath) {
                const normalized = absPath.replace(/\\/g, "/");
                log(`Replacing markdown ref "${url}" → "${normalized}"`);
                return `${bang}[${label}](${normalized})`;
              }
              return match;
            },
          );

          // Append absolute path info so the LLM prompt includes correct paths
          const pathLines: string[] = [];
          for (const [filename, absPath] of fileMappings) {
            const normalized = absPath.replace(/\\/g, "/");
            pathLines.push(`[IMPORTANT: The image file "${filename}" is located at absolute path: ${normalized}]`);
          }
          const suffix = "\n" + pathLines.join("\n");
          if (!updated.includes(suffix.trim())) {
            updated = updated + suffix;
            log(`Appended path info to user text`);
          }

          if (updated !== original) {
            log(`Updated text:\n  FROM: ${original}\n  TO:   ${updated}`);
            (part as any).text = updated;
          }
          // Only modify the first non-synthetic text part
          break;
        }
      } catch (err: any) {
        log(`Error: ${err?.stack || err}`);
      }
    },
  };
};

export default plugin;
