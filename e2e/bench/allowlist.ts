/**
 * The shell commands an Agent may run in the bench, and the rule a command
 * line is held to where the Agent has no allowlist of its own (pi, by the
 * bench's extension; the scripted pass). Nothing here but Node's own: pi
 * loads it from the run's folder, beside that extension.
 */
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

/** The shell commands an Agent may run: the command line, and reading the project. */
export const SHELL = ["npx 03kind", "git diff", "git status", "git log", "git show", "ls", "cat", "head", "tail", "wc", "grep", "rg", "find", "npx tsc"];

/**
 * The commands an Agent may run as they are, with nothing after them: the
 * Skill's undo, `git apply` with the patch on its input (`npx 03kind last`
 * prints it), and no option or patch file (`--unsafe-paths`, `--directory`
 * and the like).
 */
export const EXACT = ["git apply"];

/** How a tool result turned away by the bench starts: what the transcript is counted by. */
export const DENIED = "Not run: the 03Kind bench allows";

/** The reason a turned-away command is given, for the Agent to read. */
export function deniedReason(command: string): string {
  return `${DENIED} only these shell commands, each on its own or joined by &&, ||, ;, | (output to /dev/null or 2>&1 at most; no $ expansion, brace expansion, subshell or background &): ${SHELL.join(", ")}; ${EXACT.join(", ")} alone, the patch on its input; git -C with the project's own folder as git; and cd to a folder in the project. Turned away: ${command}`;
}

/**
 * Options of a listed command that run another program or write a file, by
 * the command's first words, matched against each word as bash passes it.
 */
const RUNS_OR_WRITES: Record<string, RegExp> = {
  find: /^-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)$/,
  rg: /^--(pre|hostname-bin)(=|$)/,
  // git takes a long option by any prefix of it that names no other: `--outp=x` is `--output=x`.
  git: /^--ou(t(p(u(t)?)?)?)?(=|$)/,
  // tsc reads its options in any case, and more of them from a file named after @; --init writes a tsconfig.json.
  "npx tsc": /^(--(outdir|outfile|out|generatetrace|generatecpuprofile|tsbuildinfofile|build|declarationdir|init)(=|$)|-b$|@)/i,
};

/** A word of a command as bash passes it, and which of its characters bash still reads as more than text (unquoted, unescaped). */
interface Word {
  text: string;
  bare: boolean[];
}

/**
 * Whether the bench lets `command` run: every command in it, split at `&&`,
 * `||`, `;`, `|` and new lines (outside quotes), is one of `allowed` (its
 * words, then any arguments), one of `EXACT` as it is, or a `cd` to one
 * folder; a leading `git -C <folder>` is read as `git` when the folder, by
 * its real path, is `project` or one in it, not in its `.git` (none without `project`), the
 * rest of the command held to the rule as usual; none sets a variable first or uses an
 * option that runs another program or writes a file. Each is matched by the
 * words bash will pass, quotes taken out and backslashes read. Nothing runs a
 * command inside another (`$( )`, backticks, `<( )`, `>( )`), in a subshell
 * or in the background (a lone `&`); no word has an expansion bash fills in
 * (`$name`, `${ }`, `$'…'`, `$"…"`, braces), or a pattern that could name an
 * option of a command that has one of those; and output is redirected only to
 * /dev/null or another stream. What the rule cannot read is turned away.
 */
export function shellAllowed(command: string, allowed: readonly string[] = SHELL, project?: string): boolean {
  const commands = parse(command)?.filter((words) => words.length > 0);
  return !!commands && commands.length > 0 && commands.every((words) => allowedCommand(inProjectGit(words, project), allowed));
}

/**
 * `git -C <folder> …` as `git …` when the folder is written in full and is,
 * by its real path, `project` or a folder in it: as `npx 03kind last` writes
 * its commands (`git rev-parse --show-toplevel`, on macOS the real path). Any
 * other is left as it is, for the rule to turn away.
 */
function inProjectGit(words: Word[], project: string | undefined): Word[] {
  const [git, option, folder] = words.map((word) => word.text);
  if (git !== "git" || option !== "-C" || !project || folder === undefined || !isAbsolute(folder)) return words;
  const root = realPath(project);
  const there = realPath(resolve(folder));
  // Not the repository's own folder: in `.git` git sees no work tree, and `git apply` there could write its config.
  const inGit = there.slice(root.length).split(sep).some((part) => part.toLowerCase() === ".git");
  return (there === root || there.startsWith(root + sep)) && !inGit ? [words[0], ...words.slice(3)] : words;
}

/** A path as the file system has it, so `/var/…` and `/private/var/…` compare alike: the real path of the nearest folder there is, and the rest. */
export function realPath(path: string): string {
  const rest: string[] = [];
  for (let dir = path; ; dir = dirname(dir)) {
    try {
      return join(realpathSync(dir), ...rest);
    } catch {
      if (dirname(dir) === dir) return path;
      rest.unshift(basename(dir));
    }
  }
}

/** The words of each command in a command line, as bash passes them; null when the rule turns the line away. */
export function shellWords(command: string): string[][] | null {
  return parse(command)?.map((words) => words.map((word) => word.text)) ?? null;
}

function allowedCommand(words: Word[], allowed: readonly string[]): boolean {
  const text = words.map((word) => word.text);
  if (words.some(expandsBraces)) return false;
  if (/^\w+=/.test(text[0])) return false;
  // One folder, no option: bare `cd` goes home, `cd -` back, and `-P` or `-L` are no folder.
  if (text[0] === "cd") return words.length === 2 && !text[1].startsWith("-");
  const starts = (prefix: string) => prefix.split(" ").every((word, i) => text[i] === word);
  if (EXACT.includes(text.join(" "))) return true;
  const options = Object.entries(RUNS_OR_WRITES).flatMap(([prefix, option]) => (starts(prefix) ? [option] : []));
  if (options.length && words.some((word) => options.some((option) => option.test(word.text)) || mayNameAnOption(word))) return false;
  return allowed.some(starts);
}

/** `{a,b}` or `{a..b}`, its braces bare: bash makes several words of it. */
function expandsBraces({ text, bare }: Word): boolean {
  const open = [...text].findIndex((char, i) => char === "{" && bare[i]);
  const close = [...text].findLastIndex((char, i) => char === "}" && bare[i]);
  if (open < 0 || close < open) return false;
  return [...text.slice(open + 1, close)].some((char, i) => {
    const at = open + 1 + i;
    return bare[at] && (char === "," || (char === "." && text[at + 1] === "." && bare[at + 1]));
  });
}

/** A pattern bash fills in from the file names there are, which could give a word that starts with `-`. */
function mayNameAnOption({ text, bare }: Word): boolean {
  const pattern = [...text].some((char, i) => bare[i] && "*?[".includes(char));
  return pattern && (text[0] === "-" || (bare[0] && "*?[".includes(text[0])));
}

/**
 * The commands of a command line, each the words bash will pass, the allowed
 * redirections taken out; null when it holds something the rule turns away.
 */
function parse(line: string): Word[][] | null {
  const commands: Word[][] = [];
  let words: Word[] = [];
  let word: Word | null = null;
  let quote: "'" | '"' | null = null;
  const add = (char: string, bare: boolean) => {
    word ??= { text: "", bare: [] };
    word.text += char;
    word.bare.push(bare);
  };
  const endWord = () => {
    if (word) words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    commands.push(words);
    words = [];
  };
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const ahead = line[i + 1] ?? "";
    if (quote === "'") {
      if (char === "'") quote = null;
      else add(char, false);
      continue;
    }
    if (char === "`") return null;
    // `$( )`, `$name`, `${ }`, `$[ ]` and the special parameters: what bash fills in is not in the line.
    if (char === "$" && /[\w({[@*#?!$-]/.test(ahead)) return null;
    if (quote === '"') {
      if (char === '"') quote = null;
      // In double quotes a backslash escapes only these; before anything else it is text.
      else if (char === "\\" && '$`"\\\n'.includes(ahead) && ahead) {
        if (ahead !== "\n") add(ahead, false);
        i++;
      } else add(char, false);
      continue;
    }
    if (char === "\\") {
      if (!ahead) return null;
      // A backslash and a new line join two lines.
      if (ahead !== "\n") add(ahead, false);
      i++;
    } else if (char === "'" || char === '"') {
      word ??= { text: "", bare: [] };
      quote = char;
    } else if (char === "$" && (ahead === "'" || ahead === '"')) return null;
    else if (char === "(" || char === ")") return null;
    else if (char === "#" && word === null) {
      // A comment, to the end of the line.
      while (i + 1 < line.length && line[i + 1] !== "\n") i++;
    } else if (char === " " || char === "\t") endWord();
    else if (char === ";" || char === "\n") endCommand();
    else if ((char === "&" && ahead === "&") || (char === "|" && (ahead === "|" || ahead === "&"))) {
      endCommand();
      i++;
    } else if (char === "|") endCommand();
    else if (char === "&" && ahead !== ">") return null;
    else if (char === ">" || char === "<" || char === "&") {
      // A redirection: `[n]>`, `[n]>>`, `&>`, `[n]>&m`, with what it goes to, a whole word.
      const match = /^(&>|>>|>&|<&|>|<)[ \t]*([\w/.-]*)(?=$|[\s;&|<>])/.exec(line.slice(i));
      if (!match) return null;
      const [whole, operator, target] = match;
      const toStream = (operator === ">&" || operator === "<&") && /^(\d+|-)$/.test(target);
      const toNothing = (operator === ">" || operator === ">>" || operator === "&>") && target === "/dev/null";
      if (!toStream && !toNothing) return null;
      // The stream's number, written just before it, goes too.
      const current: Word | null = word;
      if (current && /^\d+$/.test(current.text) && current.bare.every(Boolean)) word = null;
      else endWord();
      i += whole.length - 1;
    } else add(char, true);
  }
  if (quote) return null;
  endCommand();
  return commands;
}
