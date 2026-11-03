/**
 * The bench's own extension for pi, loaded with `-e` in its runs only (from
 * a copy in the run's folder, with `allowlist.ts` beside it). pi has no
 * allowlist of its own for shell commands: this blocks every `bash` call the
 * bench's rule turns away, as Claude Code's `--allowedTools` does, and the
 * Agent reads why. And pi has no switch for leaving out only the designer's
 * global AGENTS.md: this keeps the instructions files inside the project, as
 * Claude Code's `--setting-sources project,local` does.
 */
import { realpathSync } from "node:fs";
import { sep } from "node:path";
import { deniedReason, shellAllowed } from "./allowlist.ts";

/** As much of pi's extension API as the bench uses (`@earendil-works/pi-coding-agent`, which the repository does not install). */
interface PiExtensionApi {
  on(event: "tool_call" | "before_agent_start", handler: (event: any) => unknown): void;
}

/** A path as the file system has it, so `/var/…` and `/private/var/…` compare alike. */
function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export default function benchExtension(pi: PiExtensionApi) {
  pi.on("tool_call", (event: { toolName: string; input: { command?: unknown } }) => {
    if (event.toolName !== "bash") return undefined;
    const command = String(event.input.command ?? "");
    return shellAllowed(command) ? undefined : { block: true, reason: deniedReason(command) };
  });
  pi.on("before_agent_start", (event: { systemPromptOptions: { cwd: string; contextFiles: { path: string }[] } }) => {
    const options = event.systemPromptOptions;
    const project = realPath(options.cwd) + sep;
    options.contextFiles = options.contextFiles.filter((file) => realPath(file.path).startsWith(project));
  });
}
