import { describe, expect, test } from 'vitest';
import { runN8n, type N8nDeps } from '#scripts/n8n';

const KEY = 'n8n_api_secret_123';

type Call = { url: string; method: string | undefined; headers: Record<string, string>; body: string | undefined };

/** An n8n instance that answers every call with `status` and `body`, and records the calls. */
function fakeN8n(answer: { status?: number; body?: string } = {}): { deps: N8nDeps; calls: Call[] } {
  const calls: Call[] = [];
  const stub = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: input instanceof Request ? input.url : input.toString(),
      method: init?.method,
      headers: Object.fromEntries(headers.entries()),
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    return Promise.resolve(new Response(answer.body ?? '{"data":[]}', { status: answer.status ?? 200 }));
  };
  return { deps: { env: { N8N_URL: 'https://n8n.example.com/', N8N_API_KEY: KEY }, fetch: stub, readStdin: () => '{"from":"stdin"}' }, calls };
}

describe('runN8n', () => {
  test('should call the public API with the key header and print the body when the method is GET', async () => {
    const n8n = fakeN8n({ body: '{"data":[{"id":"1"}]}' });

    const run = await runN8n(['GET', '/workflows?limit=1'], n8n.deps);

    expect([run, n8n.calls[0]?.url, n8n.calls[0]?.headers['x-n8n-api-key']]).toEqual([
      { exitCode: 0, stdout: '{\n  "data": [\n    {\n      "id": "1"\n    }\n  ]\n}\n', stderr: '' },
      'https://n8n.example.com/api/v1/workflows?limit=1',
      KEY,
    ]);
  });

  test('should send the JSON body given as an argument when the method writes', async () => {
    const n8n = fakeN8n();

    await runN8n(['post', '/tags', '{"name":"billing"}'], n8n.deps);

    expect([n8n.calls[0]?.method, n8n.calls[0]?.body, n8n.calls[0]?.headers['content-type']]).toEqual(['POST', '{"name":"billing"}', 'application/json']);
  });

  test('should read the body from stdin when the body is -', async () => {
    const n8n = fakeN8n();

    await runN8n(['PUT', '/tags/1', '-'], n8n.deps);

    expect(n8n.calls[0]?.body).toBe('{"from":"stdin"}');
  });

  test('should refuse a body that is not JSON without calling n8n', async () => {
    const n8n = fakeN8n();

    const run = await runN8n(['POST', '/tags', 'name=billing'], n8n.deps);

    expect([run.exitCode, run.stderr, n8n.calls]).toEqual([1, 'The body is not valid JSON.\n', []]);
  });

  test('should print the usage and call nothing when the method is unknown', async () => {
    const n8n = fakeN8n();

    const run = await runN8n(['FETCH', '/workflows'], n8n.deps);

    expect([run.exitCode, run.stderr.startsWith('Usage: npm run n8n'), n8n.calls]).toEqual([1, true, []]);
  });

  test('should refuse a full URL so the key never goes to another host', async () => {
    const n8n = fakeN8n();

    const runs = [await runN8n(['GET', 'https://evil.example.com/x'], n8n.deps), await runN8n(['GET', '//evil.example.com/x'], n8n.deps)];

    expect([runs.map((run) => run.exitCode), n8n.calls]).toEqual([[1, 1], []]);
  });

  test('should ask for .env when the URL or the key is missing', async () => {
    const n8n = fakeN8n();

    const run = await runN8n(['GET', '/workflows'], { ...n8n.deps, env: { N8N_URL: 'https://n8n.example.com' } });

    expect([run.exitCode, run.stderr]).toEqual([1, 'N8N_URL and N8N_API_KEY must be set in .env (see .env.example). Ask the user to fill them in.\n']);
  });

  test('should exit 1 with the status and the body when n8n answers an error', async () => {
    const n8n = fakeN8n({ status: 404, body: '{"message":"Not Found"}' });

    const run = await runN8n(['GET', '/workflows/9'], n8n.deps);

    expect(run).toEqual({ exitCode: 1, stdout: '{\n  "message": "Not Found"\n}\n', stderr: 'n8n answered 404 to GET /workflows/9\n' });
  });

  test('should never print the key when n8n echoes it or the call fails', async () => {
    const echoed = fakeN8n({ body: `{"header":"${KEY}"}` });
    const failing: N8nDeps = { ...echoed.deps, fetch: () => Promise.reject(new Error(`connect ECONNREFUSED with ${KEY}`)) };

    const runs = [await runN8n(['GET', '/me'], echoed.deps), await runN8n(['GET', '/me'], failing)];

    expect(runs.map((run) => `${run.stdout}${run.stderr}`.includes(KEY))).toEqual([false, false]);
  });
});
