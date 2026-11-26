// Claude Code PreToolUse hook, wired by .claude/settings.json. Node.js runs this file as it is: it strips the types.
// It reads the tool call as JSON on stdin and prints a decision as JSON on stdout:
// - deny: a Read, a Grep or a Bash command that would show a .env file (.env.example is fine);
// - ask: a Guarded command (AGENTS.md), so Claude Code asks the user before it runs;
// - nothing: Claude Code's usual permissions decide.
import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export type HookDecision = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'ask' | 'deny';
    permissionDecisionReason: string;
  };
};

/** Commands that print a file they are given, or a part of it. */
const PRINTERS = new Set([
  'awk', 'bat', 'batcat', 'base64', 'cat', 'column', 'cut', 'diff', 'egrep', 'fgrep', 'gawk', 'grep', 'head', 'hexdump',
  'jq', 'less', 'more', 'nl', 'od', 'rg', 'sed', 'sort', 'strings', 'tac', 'tail', 'uniq', 'view', 'xxd',
]);

/** Words that run the command after them: `sudo cat .env` is `cat .env`. */
const WRAPPERS = new Set(['command', 'exec', 'nohup', 'sudo', 'time', 'xargs']);

/** The npm scripts of package.json that run lift, so `npm run deploy` is checked as `lift deploy`. */
const LIFT_SCRIPTS: Readonly<Record<string, string[]>> = {
  ping: ['ping'],
  check: ['deploy', '--dry-run'],
  deploy: ['deploy'],
  status: ['status'],
  'n8n:publish': ['publish'],
  creds: ['creds', 'sync'],
  clean: ['clean'],
};

/** The decision for one tool call, or `undefined` to leave it to Claude Code's permissions. */
export function guard(input: unknown): HookDecision | undefined {
  if (!isRecord(input) || !isRecord(input.tool_input)) {
    return undefined;
  }
  const tool = input.tool_name;
  const args = input.tool_input;
  if (tool === 'Read' && typeof args.file_path === 'string' && isEnvFile(args.file_path)) {
    return deny(`${args.file_path} holds secrets: never read a .env file. Read .env.example for the variable names.`);
  }
  if (tool === 'Grep' && [args.path, args.glob].some((value) => typeof value === 'string' && isEnvFile(value))) {
    return deny('A .env file holds secrets: never search it. Read .env.example for the variable names.');
  }
  if (tool === 'Bash' && typeof args.command === 'string') {
    return guardCommand(args.command);
  }
  return undefined;
}

function guardCommand(command: string): HookDecision | undefined {
  const reasons = segments(command).map(checkSegment);
  const denied = reasons.find((reason) => reason?.decision === 'deny');
  if (denied) {
    return deny(denied.reason);
  }
  const asked = reasons.filter((reason) => reason?.decision === 'ask').map((reason) => reason?.reason);
  return asked.length === 0 ? undefined : ask(asked.join(' '));
}

type SegmentCheck = { decision: 'ask' | 'deny'; reason: string } | undefined;

function checkSegment(words: string[]): SegmentCheck {
  const redirected = words.findIndex((word, index) => word === '<' && isEnvFile(words[index + 1] ?? ''));
  if (redirected !== -1 || words.some((word) => /^<\S/.test(word) && isEnvFile(word.slice(1)))) {
    return { decision: 'deny', reason: 'A .env file holds secrets: never print it. Read .env.example for the variable names.' };
  }
  const [name, ...rest] = unwrap(words);
  if (name === undefined) {
    return undefined;
  }
  if ((name === 'bash' || name === 'sh' || name === 'zsh') && rest[0] === '-c' && rest[1] !== undefined) {
    const inner = guardCommand(rest[1]);
    return inner && { decision: inner.hookSpecificOutput.permissionDecision, reason: inner.hookSpecificOutput.permissionDecisionReason };
  }
  if (PRINTERS.has(name) && rest.some(isEnvFile)) {
    return { decision: 'deny', reason: 'A .env file holds secrets: never print it. Read .env.example for the variable names.' };
  }
  const lift = liftArgs(name, rest);
  if (lift) {
    return checkLift(lift);
  }
  const n8n = n8nArgs(name, rest);
  if (n8n) {
    return checkN8n(n8n);
  }
  return undefined;
}

/** The words of the command once the variables set before it (`A=1 cmd`), the wrappers and the path are dropped. */
function unwrap(words: string[]): string[] {
  let rest = words;
  let wrapped = false;
  while (rest.length > 0) {
    const [first = '', ...after] = rest;
    if (WRAPPERS.has(first) || first === 'env') {
      wrapped = true;
    } else if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(first) && !(wrapped && first.startsWith('-'))) {
      break;
    }
    rest = after;
  }
  const [name, ...args] = rest;
  return name === undefined ? [] : [basename(name), ...args];
}

/** The arguments given to lift (`lift`, `boilerlift`, `npx lift`, `npm exec lift`, `npm run deploy`), or `undefined`. */
function liftArgs(name: string, args: string[]): string[] | undefined {
  if (name === 'lift' || name === 'boilerlift') {
    return args;
  }
  if (name === 'npx' || name === 'pnpx' || name === 'bunx' || ((name === 'npm' || name === 'pnpm') && (args[0] === 'exec' || args[0] === 'x'))) {
    const after = name === 'npm' || name === 'pnpm' ? args.slice(1) : args;
    const index = after.findIndex((word) => !word.startsWith('-'));
    const bin = after[index];
    if (bin === 'lift' || bin === 'boilerlift') {
      return after.slice(index + 1).filter((word) => word !== '--');
    }
    return undefined;
  }
  const script = npmScript(name, args);
  const mapped = script && LIFT_SCRIPTS[script.name];
  return mapped ? [...mapped, ...script.args] : undefined;
}

/** The arguments given to `npm run n8n`, or `undefined`. */
function n8nArgs(name: string, args: string[]): string[] | undefined {
  const script = npmScript(name, args);
  return script?.name === 'n8n' ? script.args : undefined;
}

/** `npm run <name> -- <args>` (or `npm run-script`, `pnpm run`, `yarn`), or `undefined`. */
function npmScript(name: string, args: string[]): { name: string; args: string[] } | undefined {
  const runs = (name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun') && (args[0] === 'run' || args[0] === 'run-script');
  const words = runs ? args.slice(1) : name === 'yarn' ? args : undefined;
  if (!words) {
    return undefined;
  }
  const index = words.findIndex((word) => !word.startsWith('-'));
  const script = words[index];
  if (script === undefined) {
    return undefined;
  }
  return { name: script, args: words.slice(index + 1).filter((word) => word !== '--') };
}

function checkLift(args: string[]): SegmentCheck {
  if (args.includes('-h') || args.includes('--help')) {
    return undefined;
  }
  const { command, targets, all } = readLiftArgs(args);
  switch (command) {
  case 'publish':
    return { decision: 'ask', reason: 'lift publish is a Guarded command: it makes drafts the published version. Run it only after the user says yes in the chat.' };
  case 'clean':
    return args.includes('--dry-run')
      ? undefined
      : { decision: 'ask', reason: 'lift clean without --dry-run is a Guarded command: it archives or deletes workflows on n8n. Run it only after the user says yes in the chat.' };
  case 'reset':
    return args.includes('--dry-run')
      ? undefined
      : { decision: 'ask', reason: 'lift reset without --dry-run is a Guarded command: it archives or deletes every workflow deployed on the target. Run it only after the user says yes in the chat.' };
  case 'deploy':
    return !all && targets.length > 0 && targets.every((target) => target === 'dev')
      ? undefined
      : { decision: 'ask', reason: 'lift deploy without -t dev is a Guarded command: it may write to another n8n instance. Pass -t dev, or run it only after the user says yes in the chat.' };
  default:
    return undefined;
  }
}

/** The command name and the target options, before or after it. */
function readLiftArgs(args: string[]): { command: string | undefined; targets: string[]; all: boolean } {
  let command: string | undefined;
  const targets: string[] = [];
  let all = false;
  for (let index = 0; index < args.length; index++) {
    const word = args[index] ?? '';
    if (word === '-t' || word === '--target') {
      targets.push(args[index + 1] ?? '');
      index++;
    } else if (word.startsWith('--target=')) {
      targets.push(word.slice('--target='.length));
    } else if (/^-t\S/.test(word)) {
      targets.push(word.slice(2).replace(/^=/, ''));
    } else if (word === '--all') {
      all = true;
    } else if (command === undefined && !word.startsWith('-')) {
      command = word;
    }
  }
  return { command, targets, all };
}

function checkN8n(args: string[]): SegmentCheck {
  const method = args[0]?.toUpperCase();
  return method === 'GET'
    ? undefined
    : { decision: 'ask', reason: `npm run n8n ${args[0] ?? ''} is a Guarded command: only GET leaves n8n unchanged. Run it only after the user says yes in the chat.` };
}

/** `.env`, `.env.local`, `config/.env.prod`, `.env*`… but not `.env.example`. */
function isEnvFile(path: string): boolean {
  const name = basename(path.replace(/^["']|["']$/g, ''));
  return /^\.env([.*?[]|$)/.test(name) && name !== '.env.example';
}

/**
 * The simple commands of a command line, each split into words: split on `&&`, `||`, `;`, `|`, `&`, new lines,
 * parentheses and backticks, outside quotes. Quotes are removed from the words, as the shell does.
 */
function segments(command: string): string[][] {
  const result: string[][] = [];
  let words: string[] = [];
  let word = '';
  let inWord = false;
  let quote: '"' | "'" | undefined;
  const endWord = (): void => {
    if (inWord) {
      words.push(word);
    }
    word = '';
    inWord = false;
  };
  const endSegment = (): void => {
    endWord();
    if (words.length > 0) {
      result.push(words);
    }
    words = [];
  };
  for (let index = 0; index < command.length; index++) {
    const char = command[index] ?? '';
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else if (char === '\\' && quote === '"' && index + 1 < command.length) {
        word += command[++index] ?? '';
      } else {
        word += char;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
      inWord = true;
    } else if (char === '\\' && index + 1 < command.length) {
      word += command[++index] ?? '';
      inWord = true;
    } else if (char === '$' && command[index + 1] === '(') {
      endSegment();
      index++;
    } else if ('&|;\n()`'.includes(char)) {
      endSegment();
    } else if (char === '<' || char === '>') {
      endWord();
      words.push(char);
    } else if (/\s/.test(char)) {
      endWord();
    } else {
      word += char;
      inWord = true;
    }
  }
  endSegment();
  return result;
}

function ask(reason: string): HookDecision {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } };
}

function deny(reason: string): HookDecision {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function main(): void {
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return;
  }
  const decision = guard(input);
  if (decision) {
    process.stdout.write(`${JSON.stringify(decision)}\n`);
  }
}

// Run as a script, not imported by a test. realpath: Node.js resolves symlinks in import.meta.url, not in argv.
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
