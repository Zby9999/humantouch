/**
 * The shell commands an Agent may run in the bench, and the rule a command
 * line is held to where the Agent has no allowlist of its own (pi, by the
 * bench's extension). Nothing here but Node's own: pi loads it from the run's
 * folder, beside that extension.
 */

/** The shell commands an Agent may run: the command line, and reading the project. */
export const SHELL = ["npx 03kind", "git diff", "git status", "git log", "git show", "ls", "cat", "head", "tail", "wc", "grep", "rg", "find", "npx tsc"];

/** How a tool result turned away by the bench starts: what the transcript is counted by. */
export const DENIED = "Not run: the 03Kind bench allows";

/** The reason a turned-away command is given, for the Agent to read. */
export function deniedReason(command: string): string {
  return `${DENIED} only these shell commands, each on its own or joined by &&, ||, ;, | (output to /dev/null or 2>&1 at most): ${SHELL.join(", ")}, and cd. Turned away: ${command}`;
}

/** Options of a listed command that run another program or write a file. */
const RUNS_OR_WRITES: Record<string, RegExp> = {
  find: /^-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)$/,
  rg: /^--pre(=|$)/,
  git: /^--output(=|$)/,
};

/**
 * Whether the bench lets `command` run: every command in it, split at `&&`,
 * `||`, `;`, `|`, `&` and new lines (outside quotes), is one of `allowed` (its
 * words, then any arguments) or a `cd`; none sets a variable first or uses an
 * option that runs another program or writes a file; nothing runs a command
 * inside another (`$( )`, backticks, `<( )`, `>( )`); and output is redirected
 * only to /dev/null or another stream. What the rule cannot read is turned away.
 */
export function shellAllowed(command: string, allowed: readonly string[] = SHELL): boolean {
  const commands = split(command);
  if (!commands) return false;
  const words = commands.map((part) => part.trim().split(/\s+/)).filter((part) => part[0] !== "");
  return words.length > 0 && words.every((part) => allowedCommand(part, allowed));
}

function allowedCommand(words: string[], allowed: readonly string[]): boolean {
  if (/^\w+=/.test(words[0])) return false;
  if (words[0] === "cd") return words.length <= 2;
  const options = RUNS_OR_WRITES[words[0]];
  if (options && words.some((word) => options.test(word))) return false;
  return allowed.some((entry) => entry.split(" ").every((word, i) => words[i] === word));
}

/**
 * The commands of a command line, quotes kept as written and the allowed
 * redirections taken out; null when it holds something the rule turns away.
 */
function split(line: string): string[] | null {
  const commands: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  const next = () => {
    commands.push(current);
    current = "";
  };
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const ahead = line[i + 1];
    if (quote === "'") {
      if (char === "'") quote = null;
      current += char;
      continue;
    }
    if (char === "\\") {
      current += char + (ahead ?? "");
      i++;
      continue;
    }
    if (char === "`" || (char === "$" && ahead === "(")) return null;
    if (quote === '"') {
      if (char === '"') quote = null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if ((char === "<" || char === ">") && ahead === "(") return null;
    if (char === ";" || char === "\n") next();
    else if ((char === "&" && ahead === "&") || (char === "|" && (ahead === "|" || ahead === "&"))) {
      next();
      i++;
    } else if (char === "|" || (char === "&" && ahead !== ">")) next();
    else if (char === ">" || char === "<" || char === "&") {
      // A redirection: `[n]>`, `[n]>>`, `&>`, `[n]>&m`, with what it goes to.
      const match = /^(&>|>>|>&|<&|>|<)\s*([^\s;&|<>]*)/.exec(line.slice(i));
      if (!match) return null;
      const [whole, operator, target] = match;
      const toStream = (operator === ">&" || operator === "<&") && /^(\d+|-)$/.test(target);
      const toNothing = (operator === ">" || operator === ">>" || operator === "&>") && target === "/dev/null";
      if (!toStream && !toNothing) return null;
      // The stream's number, written just before it, goes too.
      current = current.replace(/(^|\s)\d+$/, "$1");
      i += whole.length - 1;
    } else current += char;
  }
  if (quote) return null;
  next();
  return commands;
}
