// `npm run n8n -- <METHOD> <path> [body]`: one call to the n8n public API of the dev target, for what lift does not do
// (read an execution, list tags…). It reads N8N_URL and N8N_API_KEY from the environment, then from .env, sends the
// key in the X-N8N-API-KEY header, and prints the response body. It never prints the key.
// The body is JSON, given as the third argument, or `-` to read it from stdin.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export type N8nRun = { exitCode: number; stdout: string; stderr: string };

export type N8nDeps = {
  env: Readonly<Record<string, string | undefined>>;
  fetch: typeof fetch;
  readStdin: () => string;
};

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const USAGE = `Usage: npm run n8n -- <METHOD> <path> [body | -]
  METHOD  ${METHODS.join(', ')}
  path    an n8n public API path, after /api/v1: /workflows, /executions?limit=5…
  body    JSON for POST, PUT and PATCH, or - to read it from stdin
`;

/** Calls `<N8N_URL>/api/v1<path>` and returns what to print. Never throws, and no output holds the API key. */
export async function runN8n(args: string[], deps: N8nDeps): Promise<N8nRun> {
  const [rawMethod, path, body] = args;
  const method = rawMethod?.toUpperCase();
  if (method === undefined || !METHODS.includes(method) || path === undefined || args.length > 3) {
    return { exitCode: 1, stdout: '', stderr: USAGE };
  }
  if (!path.startsWith('/') || path.startsWith('//')) {
    return { exitCode: 1, stdout: '', stderr: `The path must start with one /, after /api/v1: ${path}\n${USAGE}` };
  }
  const url = deps.env.N8N_URL?.trim().replace(/\/+$/, '');
  const apiKey = deps.env.N8N_API_KEY?.trim();
  if (!url || !apiKey) {
    return { exitCode: 1, stdout: '', stderr: 'N8N_URL and N8N_API_KEY must be set in .env (see .env.example). Ask the user to fill them in.\n' };
  }
  const hide = (text: string): string => text.replaceAll(apiKey, '***');
  let payload: string | undefined;
  if (body !== undefined) {
    payload = body === '-' ? deps.readStdin() : body;
    try {
      JSON.parse(payload);
    } catch {
      return { exitCode: 1, stdout: '', stderr: 'The body is not valid JSON.\n' };
    }
  }
  try {
    const response = await deps.fetch(`${url}/api/v1${path}`, {
      method,
      headers: { 'X-N8N-API-KEY': apiKey, accept: 'application/json', ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(payload === undefined ? {} : { body: payload }),
    });
    const text = hide(pretty(await response.text()));
    if (!response.ok) {
      const status = response.statusText ? `${response.status} ${hide(response.statusText)}` : String(response.status);
      return { exitCode: 1, stdout: text, stderr: `n8n answered ${status} to ${method} ${path}\n` };
    }
    return { exitCode: 0, stdout: text, stderr: '' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, stdout: '', stderr: hide(`n8n cannot be reached at ${url}: ${reason}\n`) };
  }
}

/** The body as indented JSON when it is JSON, as it came otherwise; ends with a new line. */
function pretty(text: string): string {
  if (text === '') {
    return '';
  }
  try {
    return `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
  } catch {
    return text.endsWith('\n') ? text : `${text}\n`;
  }
}

/** The environment, completed by the variables of .env that it does not set. */
function loadEnv(): Record<string, string | undefined> {
  const file = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
  return { ...file, ...process.env };
}

async function main(): Promise<void> {
  const run = await runN8n(process.argv.slice(2), { env: loadEnv(), fetch, readStdin: () => readFileSync(0, 'utf8') });
  process.stdout.write(run.stdout);
  process.stderr.write(run.stderr);
  process.exitCode = run.exitCode;
}

// Run as a script, not imported by a test. realpath: Node.js resolves symlinks in import.meta.url, not in argv.
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
