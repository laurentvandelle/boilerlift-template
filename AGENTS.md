# AGENTS.md

Instructions for AI agents working in this project. It holds n8n workflows as code, delivered to n8n with Boilerlift (the `lift` command). Humans read `README.md` and `ARCHITECTURE.md`.

## Role

This project holds n8n workflows as typed files and delivers them to n8n instances with `lift`. Your job is to write and change those workflow files, check them, and deliver them as drafts.

## Project

- `boilerlift.config.ts`: the targets. Each one has an n8n `url`, an `apiKey` read from the environment, and a `workflows` folder. The variables of `./.env` are loaded first.
- `code/`: the JavaScript of Code nodes, one tested function per file. A workflow imports it through `#code/<name>`.
- `workflows/`: one workflow per file, `<name>.workflow.ts` (a `defineWorkflow({...})` default export) or `<name>.json` (an n8n export). The file name is the workflow's stable name: 1 to 64 lowercase letters, digits or dashes.
- `boilerlift.lock.json`: written by `lift deploy`, it links each stable name to its n8n id. Never edit it by hand.
- `scripts/n8n.ts`: `npm run n8n`, one call to the n8n public API (see Commands).
- `.claude/`: the skills (see Skills), and the Claude Code hook in `.claude/hooks/`, wired by `.claude/settings.json`, that enforces the Guarded commands and the `.env` rule below.
- No secret is ever shown or written. Never show an API key, a token or a password in the chat, never write one in a file, and never read or print `.env`: it holds the URL and the API key and is never committed. Commands use it through `.env`. `.env.example` lists the variables, with empty values: read it for their names.

## Commands

| Command | What it does |
| --- | --- |
| `npm run verify` | Lint (imports and boundaries), type-check, then the tests of `code/`, `scripts/` and `.claude/hooks/` |
| `npm run lint` | ESLint only |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm test` | Vitest only |
| `npm run n8n -- <METHOD> <path> [body]` | One call to the n8n public API of the dev target: `N8N_URL` + `/api/v1<path>`, with the key of `N8N_API_KEY` from `.env`. Prints the response body, never the key; exits 1 when n8n answers an error. The body is JSON, as the third argument or `-` to read it from stdin. Example: `npm run n8n -- GET /executions?limit=5` |

Run every `lift` command with `--json`: the result is one JSON object on stdout. Read its `exitCode` first, then the rest. Name the target with `-t dev` (or `--target dev`).

| Command | What it does |
| --- | --- |
| `npx lift ping -t dev --json` | Checks Node.js, that the instance answers, and that it accepts the API key |
| `npx lift status -t dev --json` | Shows where each workflow stands on the target, and the next step |
| `npx lift deploy -t dev --dry-run --json` | Checks every workflow file and shows what deploy would do; writes nothing |
| `npx lift deploy -t dev --json` | Delivers the workflows to dev as drafts; publishes nothing |
| `npx lift creds sync -t dev --json` | Writes the credentials of the instance to `credentials/dev.ts`, and reports the ones the workflows miss |
| `npx lift clean -t dev --dry-run --json` | Lists the workflows removed from the project that clean would archive; changes nothing |
| `npx lift reset -t dev --dry-run --json` | Lists every workflow deployed on the target that reset would archive; changes nothing |
| `npx lift help [command]` | Prints the help of Boilerlift, or of one command, with its options and exit codes |

## Guarded commands

A Guarded command changes what runs on n8n, or reaches an instance other than dev. **Ask for a yes in the chat first**, and run it only once the user says yes, never on your own initiative:

| Guarded command | Why |
| --- | --- |
| `npx lift publish -t dev --json --yes` | Makes the deployed drafts the published version: they run on their triggers |
| `npx lift clean -t dev --json --yes` (any `lift clean` without `--dry-run`) | Archives, or with `--delete` deletes, the workflows removed from the project |
| `npx lift reset -t dev --json --yes` (any `lift reset` without `--dry-run`) | Archives, or with `--delete` deletes, every workflow deployed on the target |
| `lift deploy` without an explicit `-t dev`: no target, another target, or `--all` | Writes drafts to an instance other than dev |
| `npm run n8n` with a method other than `GET` | Writes to n8n |

In Claude Code, the hook asks the user to approve each Guarded command once more, even after their yes in the chat: that prompt is theirs to answer. Without `--yes`, `publish`, `clean` and `reset` ask a question in a terminal, which an agent cannot answer: always pass `--yes` once the user has agreed.

## Exit codes

| Code | Meaning | Next step |
| --- | --- | --- |
| 0 | Success | — |
| 1 | Usage error, missing or invalid `boilerlift.config.ts`, unknown target, or invalid workflow files | Read the error, fix the command or the file |
| 2 | Node.js is too old | Ask the user to update Node.js |
| 3 | The n8n instance cannot be reached | Check `N8N_URL` in `.env` with the user |
| 4 | The instance rejects the API key | Ask the user for a valid `N8N_API_KEY` |
| 5 | At least one workflow failed; the others were delivered | Read each failed workflow in the JSON |
| 6 | The instance is too old to save drafts | Ask the user to update n8n |
| 7 | Deploy could not write `boilerlift.lock.json` | Fix the file permissions, then deploy again |
| 8 | Workflows use credentials the instance does not have | Ask the user to create them in n8n, then `lift creds sync` |
| 9 | The API key cannot list the credentials | Ask the user for a key with the `credential:list` scope |
| 10 | `creds sync` could not write the credentials file | Fix the file permissions, then sync again |
| 11 | `clean` or `reset` needs a confirmation: nothing was archived | Ask the user in the chat, then rerun with `--yes` once they agree |

## Details

`npx lift help <command>` prints the options and exit codes of one command. Each command is documented on GitHub: `https://github.com/laurentvandelle/boilerlift/blob/main/docs/commands/<name>.md`, where `<name>` is `ping`, `status`, `deploy`, `publish`, `clean`, `reset`, `creds` or `init`.

## Skills

To create or change a workflow, follow [`BOILERLIFT:ship`](.claude/skills/BOILERLIFT:ship/SKILL.md) (`/BOILERLIFT:ship <what the workflow should do>` in Claude Code): interview, mermaid diagram and short summary, the user's **Shared understanding**, files, checks, draft deploy on dev, QA, then publish on a separate yes. It uses:

- [`BOILERLIFT:interviewing`](.claude/skills/BOILERLIFT:interviewing/SKILL.md): an interview on any topic, in rounds of multiple-choice questions, until shared understanding.
- [`BOILERLIFT:plan`](.claude/skills/BOILERLIFT:plan/SKILL.md): the diagram of the nodes and the short summary of a workflow, in the chat.
- [`BOILERLIFT:qa`](.claude/skills/BOILERLIFT:qa/SKILL.md): the QA scenarios to run in n8n on the deployed draft.

An agent that does not load `.claude/skills` reads these files directly.

## Routing

- Before editing `code/**`, read `code/AGENTS.md`.
- Before editing `workflows/**`, read `workflows/AGENTS.md`.
- Before adding a dependency or crossing a module boundary, read `ARCHITECTURE.md`.
- Before naming a domain concept, read `GLOSSARY.md`.
- Before writing or changing a test, read `docs/testing.md`.
- Before writing an architecture decision, read `docs/adr/README.md`.
- Before changing these instruction files, read `docs/agents.md`.
- Before treating a convention as enforced, read `docs/guardrails.md`.
- Before adding a convention after review, read `docs/maintenance.md`.

## Non-negotiables

1. The `AGENTS.md` closest to the file being changed wins over the root file.
2. The code is the source of truth. When a document and the code disagree, report the gap. Do not invent a reconciliation in the same task.
3. A rule lives in one file. Local rules live in the nearest `AGENTS.md`. The root file keeps shared rules only.

## Definition of done

Run `npm run verify`, then `npx lift deploy -t dev --dry-run --json`, before handing work back.
Never hand back a failure: fix it, then run the command again.

## Maintenance

Instruction files are code and drift without upkeep.
Before adding or changing a rule after review, read `docs/maintenance.md`.
