# My n8n workflows

Workflows as code, delivered to n8n with [Boilerlift](https://github.com/laurentvandelle/boilerlift).

## Install

Do not clone or copy this template: always create a project from it with `lift init`. Requires Node.js 22.18 or later, and n8n 2.35.0 or later.

**With an AI agent** (Claude Code, Cursor, Codex…): paste this prompt. It checks Node.js, runs `lift init`, connects the project to your n8n instance and deploys the example workflow as a draft, asking you one question at a time.

```text
Read https://raw.githubusercontent.com/laurentvandelle/boilerlift/main/docs/get-started.md
and follow it to set up Boilerlift with me, one step at a time.
```

**By hand**:

```sh
npx boilerlift init my-n8n-workflows
cd my-n8n-workflows
```

`lift init` never overwrites an existing file, never writes `.env` and never runs `npm install`. Then follow the next steps below. See [`lift init`](https://github.com/laurentvandelle/boilerlift/blob/main/docs/commands/init.md) and the [manual install](https://github.com/laurentvandelle/boilerlift/blob/main/docs/manual-install.md).

## Next steps

1. Install the dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env`, then fill in `N8N_URL` (the root URL of your n8n instance) and `N8N_API_KEY` (n8n → Settings → n8n API).

3. Check the connection:

   ```sh
   npx lift ping
   ```

4. Preview, then deploy the example workflow `workflows/hello.workflow.ts`:

   ```sh
   npx lift deploy --dry-run
   npx lift deploy
   ```

With an AI agent: ask Claude Code for `/BOILERLIFT:ship <what the workflow should do>`. It interviews you, builds the workflow, checks it, deploys it as a draft and gives you the tests to run in n8n.

`npx lift help` lists every command. The scripts of `package.json` run them too: `npm run ping`, `npm run check`, `npm run deploy`.

## Files

| File | What it is |
| --- | --- |
| `boilerlift.config.ts` | The targets: each n8n instance, its API key, and its workflows folder |
| `workflows/` | One workflow per `.workflow.ts` or `.json` file. The file name is its stable name |
| `code/` | The JavaScript of Code nodes, one tested function per file |
| `.env.example` | The variables to copy into `.env`. Never commit `.env` |
| `.claude/skills/` | The `BOILERLIFT:` skills: an AI agent takes a workflow request from interview to a draft on n8n |
| `AGENTS.md` | Instructions for AI agents working in this project (`CLAUDE.md` and `.github/copilot-instructions.md` point to it) |
