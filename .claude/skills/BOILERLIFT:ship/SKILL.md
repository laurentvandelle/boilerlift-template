---
name: "BOILERLIFT:ship"
description: "Takes one n8n workflow request from idea to a draft on the dev target, in this session: interviews the user on the trigger, the inputs, the services and credentials and the expected result, shows a mermaid diagram of the nodes and a short summary, and once the user confirms Shared understanding writes the defineWorkflow file and its Code node functions, runs npm run verify and lift deploy -t dev --dry-run until both pass, deploys the draft on dev, and gives the QA scenarios to run in n8n. Publishes only on a separate yes. Use when the user invokes /BOILERLIFT:ship <what the workflow should do>, or asks to create, build or change an n8n workflow in this project."
disable-model-invocation: true
---

Take one workflow request from interview to a draft on the `dev` target that the user tests. Everything happens in this session and in this folder: no git, no branch, no pull request.

The user does three things: answer the interview, confirm **Shared understanding**, and run the QA in n8n. Publishing is a fourth, separate decision.

Rules that hold for the whole run:

- **Read `AGENTS.md` first.** It holds the commands, the Guarded commands, the exit codes, and the routing to `workflows/AGENTS.md` and `code/AGENTS.md`. This skill does not repeat them.
- **Shared understanding is the only go-ahead for the work.** Nothing is written before the user confirms it. It covers writing the workflow and code files, `npm run verify`, `npx lift deploy -t dev --dry-run --json` and the draft `npx lift deploy -t dev --json`. It covers no Guarded command.
- **Always pass `-t dev`.** Every `lift deploy` of this skill names the target: a deploy without `-t dev` is a Guarded command.
- **A Guarded command needs a yes in the chat first.** `lift publish`, a real `lift clean` or `lift reset`, a deploy that is not `-t dev`, and an `npm run n8n` write: ask the user in the chat, and run it only once they say yes. Claude Code then asks them once more, from the hook in `.claude/hooks/`: that prompt is theirs to approve.
- **No secret, ever.** Never show an API key, a token or a password in the chat, never write one in a file, never read `.env`, and never ask the user to paste a secret. A node reaches a service through an n8n credential, named with `credential('<key>')` (see `npx lift help creds sync`).
- **Verify and dry-run pass before any deploy.** Never run `lift deploy` without `--dry-run` while either fails.
- **The diagram and the summary stay in the chat.** Write no plan, spec or notes file for them.

## 1. Read the request

The argument is what the workflow should do, in the user's words. No argument: ask for it in one sentence and wait.

Read what the request touches before the interview, so you ask only what the files do not settle:

- `boilerlift.config.ts`: the targets.
- `workflows/`: a workflow the request changes, or one that already does something close. Reuse its node types and `typeVersion`s.
- `code/`: the Code node functions already there.
- `credentials/dev.ts`, when it exists: the credentials the dev instance already holds. When it is missing and the workflow needs a credential, run `npx lift creds sync -t dev --json` (it only reads the instance).

## 2. Interview

Read `.claude/skills/BOILERLIFT:interviewing/SKILL.md` and follow its rounds, with the request and what step 1 found as the subject, and these **must-cover branches**:

- **Trigger**: what starts the workflow (a manual click, a schedule, a webhook, an event of a service), and how often.
- **Inputs**: the data it receives, and an example of one item.
- **Services & credentials**: each service it reaches, and the n8n credential it uses, by its key in `credentials/dev.ts`. A credential is created in n8n by the user: never ask for the secret itself.
- **Expected result**: what it produces, writes or sends, and where, with an example; and what happens when a service fails or there is nothing to do.

Also settle the steps between them, which of them need a Code node, and the stable name (the file name, 1 to 64 lowercase letters, digits or dashes) and the title in n8n.

When no question is left, go to step 3.

## 3. Show the diagram and the summary

Read `.claude/skills/BOILERLIFT:plan/SKILL.md` and write, in the chat and in its template, the mermaid diagram of the workflow's nodes, then the short summary.

Then ask one question: **Shared understanding?**, with two answers: `Shared understanding` (write, check and deploy a draft on dev) and `One more round` (the user names what is missing, and the interview goes on). Use `AskUserQuestion` when it exists; otherwise end the message with the question and wait.

Write nothing until the user answers `Shared understanding`. Then run steps 4 to 7 without asking anything else.

## 4. Write the files

Follow `workflows/AGENTS.md` and `code/AGENTS.md`.

- One `workflows/<name>.workflow.ts` per workflow, a `defineWorkflow({...})` default export. A changed workflow keeps its file name: the name is its identity on n8n.
- The JavaScript of each Code node is a function in `code/<name>.ts`, with its test in `code/<name>.test.ts`. Write the test from the summary's **Edge cases & rules**, one test per rule.
- A node whose parameters you do not know for sure: do not guess them. Copy them from a workflow already in `workflows/`, read them from n8n with `npm run n8n -- GET /workflows/<id>` (a read, so free), or ask the user to build that one node in the n8n editor and paste its export (⋯ → Download), then carry on.

## 5. Check

Run `npm run verify`, then `npx lift deploy -t dev --dry-run --json`. Read the result as `AGENTS.md` says: `exitCode` first, then each failed workflow.

Fix the files and run both again until both pass. A failure only the user can fix (an unreachable instance, a rejected API key, a missing credential): stop, tell the user what to do in one sentence, using the next step `AGENTS.md` gives for that exit code, and wait.

## 6. Deploy the draft

Run `npx lift deploy -t dev --json`. It delivers drafts on dev and publishes nothing. Read `exitCode`, then each entry of `results`. A draft opens in the n8n editor at `<instance>/workflow/<id>`, from the `instance` of the result and the `id` of its entry.

Exit 8 (a credential is missing on the instance): tell the user which credential to create in n8n, then run `npx lift creds sync -t dev --json` and step 5 again once they say it is done.

## 7. QA

Read `.claude/skills/BOILERLIFT:qa/SKILL.md` and give its scenarios in the chat, for the draft just deployed.

Then ask: **Publish?**, with two answers: `Publish` (the scenarios pass) and `I need to fix` (something is wrong).

- `I need to fix`: ask what is wrong unless the user already said it. Fix it within the decisions, run steps 5 and 6 again, then give only the QA scenarios the fix touches, and ask again.
- `Publish`: this is the yes in the chat that a Guarded command needs. Run `npx lift publish -t dev --json --yes`. Claude Code asks the user to approve it once more.

## 8. Reply

End with one line each, and omit a line that has nothing to say:

```text
Workflow: workflows/<name>.workflow.ts (created | changed)
Code: code/<name>.ts, tested by code/<name>.test.ts
Checks: npm run verify and lift deploy -t dev --dry-run passed
Draft: <link on n8n> (target dev)
Published: yes | no, waiting for your go-ahead
Assumptions: <the Open assumptions of the summary, for the user to check>
```
