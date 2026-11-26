import { describe, expect, test } from 'vitest';
import { guard } from '#hooks/guard';

function bash(command: string): unknown {
  return { tool_name: 'Bash', tool_input: { command } };
}

function decision(input: unknown): string | undefined {
  return guard(input)?.hookSpecificOutput.permissionDecision;
}

describe('guard on lift', () => {
  test('should ask when the command publishes', () => {
    const input = bash('npx lift publish --json --yes -t dev');

    const result = decision(input);

    expect(result).toBe('ask');
  });

  test('should ask when clean runs without --dry-run', () => {
    const input = bash('npx lift clean --json --yes -t dev');

    const result = decision(input);

    expect(result).toBe('ask');
  });

  test('should ask when reset runs without --dry-run', () => {
    const input = bash('npx lift reset --target dev --json --yes');

    const result = decision(input);

    expect(result).toBe('ask');
  });

  test('should let reset run when it is a dry run', () => {
    const input = bash('npx lift reset --target dev --dry-run --json');

    const result = decision(input);

    expect(result).toBeUndefined();
  });

  test('should let clean run when it is a dry run', () => {
    const input = bash('npx lift clean --dry-run --json');

    const result = decision(input);

    expect(result).toBeUndefined();
  });

  test('should let deploy run when it targets dev explicitly', () => {
    const inputs = ['npx lift deploy -t dev --json', 'lift deploy --target dev', 'lift --target=dev deploy', 'npx lift -t dev deploy --dry-run --json'];

    const results = inputs.map((command) => decision(bash(command)));

    expect(results).toEqual([undefined, undefined, undefined, undefined]);
  });

  test('should ask when deploy names no target', () => {
    const input = bash('npx lift deploy --json');

    const result = decision(input);

    expect(result).toBe('ask');
  });

  test('should ask when deploy targets another instance or every target', () => {
    const inputs = ['npx lift deploy -t prod --json', 'npx lift deploy -t dev --all', 'npx lift deploy -t dev -t prod'];

    const results = inputs.map((command) => decision(bash(command)));

    expect(results).toEqual(['ask', 'ask', 'ask']);
  });

  test('should check the boilerlift alias, npm exec and the npm scripts like lift', () => {
    const inputs = ['boilerlift publish', 'npm exec -- lift publish', 'npx --yes boilerlift clean', 'npm run deploy', 'npm run n8n:publish -- --yes'];

    const results = inputs.map((command) => decision(bash(command)));

    expect(results).toEqual(['ask', 'ask', 'ask', 'ask', 'ask']);
  });

  test('should ask when a Guarded command is chained after a free one', () => {
    const inputs = ['npm run verify && npx lift publish --yes', 'npx lift status; npx lift clean --yes', 'echo y | npx lift publish', 'bash -c "npx lift publish"'];

    const results = inputs.map((command) => decision(bash(command)));

    expect(results).toEqual(['ask', 'ask', 'ask', 'ask']);
  });

  test('should let the read-only commands and help run', () => {
    const inputs = ['npx lift ping --json', 'npx lift status --json -t dev', 'npx lift creds sync --json', 'npx lift publish --help', 'npm run verify'];

    const results = inputs.map((command) => decision(bash(command)));

    expect(results).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  test('should not mistake a quoted mention of publish for the command', () => {
    const input = bash('echo "run npx lift publish later"');

    const result = decision(input);

    expect(result).toBeUndefined();
  });
});

describe('guard on npm run n8n', () => {
  test('should let a GET run', () => {
    const input = bash('npm run n8n -- GET /workflows');

    const result = decision(input);

    expect(result).toBeUndefined();
  });

  test('should ask when the method writes to n8n', () => {
    const inputs = ['npm run n8n -- POST /workflows \'{"name":"x"}\'', 'npm run n8n -- delete /workflows/1', 'npm run n8n'];

    const results = inputs.map((command) => decision(bash(command)));

    expect(results).toEqual(['ask', 'ask', 'ask']);
  });
});

describe('guard on .env files', () => {
  test('should deny a command that prints a .env file', () => {
    const inputs = ['cat .env', 'grep KEY .env.local', 'head -n 3 ./config/.env', 'tail .env.production', 'sed -n 1p .env', 'awk 1 < .env', 'less ".env"', 'cat .env*'];

    const results = inputs.map((command) => decision(bash(command)));

    expect(results).toEqual(['deny', 'deny', 'deny', 'deny', 'deny', 'deny', 'deny', 'deny']);
  });

  test('should deny printing a .env file even after a Guarded command', () => {
    const input = bash('npx lift publish && cat .env');

    const result = decision(input);

    expect(result).toBe('deny');
  });

  test('should let a command print .env.example or merely use .env', () => {
    const inputs = ['cat .env.example', 'cp .env.example .env', 'ls -a'];

    const results = inputs.map((command) => decision(bash(command)));

    expect(results).toEqual([undefined, undefined, undefined]);
  });

  test('should deny the Read and Grep tools on a .env file but not on .env.example', () => {
    const inputs = [
      { tool_name: 'Read', tool_input: { file_path: '/project/.env' } },
      { tool_name: 'Grep', tool_input: { pattern: 'KEY', path: '.env.local' } },
      { tool_name: 'Read', tool_input: { file_path: '/project/.env.example' } },
    ];

    const results = inputs.map(decision);

    expect(results).toEqual(['deny', 'deny', undefined]);
  });

  test('should give the reason to Claude Code in the PreToolUse format', () => {
    const input = bash('cat .env');

    const result = guard(input);

    expect(result).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'A .env file holds secrets: never print it. Read .env.example for the variable names.',
      },
    });
  });
});
