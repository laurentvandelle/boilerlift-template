---
name: "BOILERLIFT:interviewing"
description: Interviews the user about a plan, a decision or an idea, on any topic, in rounds of multiple-choice questions, until shared understanding. A caller can pass the branches the interview must cover. Use when BOILERLIFT:ship needs the interview, or when the user invokes /BOILERLIFT:interviewing to think something through before acting on it.
---

Interview the user until you both understand the subject the same way. Map it as a **design tree**: every decision branches into the decisions that hang off it.

## The branches

The subject is what the user, or the skill that called this one, asks about. Draw the tree from it.

When the caller passes **must-cover branches**, each one is a branch of the tree: visit every one, even when the subject seems to settle it, and confirm it with the user. Skip a branch only when the user's own words or the project files already settle it, and say so in one line.

Add the branches the subject needs beyond those: what it depends on, what it produces, how it fails, what is out of scope.

## Rounds

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask now without guessing at answers you have not heard yet. Ask the frontier in one round, **at most 4 questions**. When it holds more than 4, ask the 4 that unblock the most decisions; the rest wait for the next round. Then wait for the answers.

Use the **AskUserQuestion** tool for every frontier question, when it exists. One call is one round. Each question:

- is multiple-choice, with 2 to 4 options
- has a short header (12 characters at most)
- puts your recommended option **first**, with `(Recommended)` at the end of its label
- gives each option a label and a one-line description
- is written in the user's language

AskUserQuestion always offers Other: do not add it yourself. When the user picks Other, wait for their text before going on. Without AskUserQuestion, ask the same questions in the chat, with numbered options and the recommended one first.

Each answer reshapes the tree. Recompute the frontier and ask the next round. A question whose answer depends on another question still open belongs to a later round.

## Facts are yours, decisions are the user's

Look up a fact yourself, never ask the user for it: what the project files, the tools or the docs can tell. Put every decision to the user and wait.

Never ask for a secret (an API key, a token, a password). Ask which credential or variable holds it.

## Done

The interview is done when the frontier is empty: every branch visited, the must-cover ones included, nothing silently assumed. Then hand back to the caller. Invoked on its own, sum up the decisions in the chat in a few bullets, and act on nothing until the user says so.
