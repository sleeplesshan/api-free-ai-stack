---
name: gemini-web-automation
description: Build, document, debug, or adapt API-free AI web UI automation demos using Gemini as the preferred target. Use when Codex needs to create a local webapp that sends prompts to Gemini without paid AI APIs, compare ChatGPT/Gemini/Copilot web UI automation viability, handle Playwright persistent browser sessions, extract Gemini answers, reset Gemini to a new chat, or document safety limits around CAPTCHA, Cloudflare, and login barriers.
---

# Gemini Web Automation

## Overview

Use this skill to build or maintain local browser-automation demos that get AI answers from Gemini web UI without paid API keys. Keep the implementation honest: automate normal visible UI interactions, but never bypass CAPTCHA, Cloudflare, Google rejected-login pages, or service anti-bot controls.

## Default Architecture

Use this architecture unless the project already has a stronger local pattern:

```txt
Frontend webapp
-> local Express endpoint
-> Playwright headed persistent browser
-> Gemini web UI
-> response extraction
-> reset to new Gemini chat
-> frontend result panel
```

Prefer:

- Vite + React + TypeScript for the demo UI
- Express for the local automation API
- Playwright headed `launchPersistentContext`
- `.local/gemini-profile/` for browser session state
- `.local/raw-responses/` for raw answer logs

## Target Selection

Use Gemini as the default web UI automation target.

- ChatGPT: Document as unreliable for this workflow when Cloudflare human verification repeats. Do not bypass.
- Gemini: Use as the proven implementation path for prompt input, send, extraction, and reset.
- Copilot: Treat as a viable target, but validate Microsoft login/security and selectors before claiming full implementation.

## Implementation Workflow

1. Inspect the existing project and keep edits scoped to the demo folder.
2. Add or update a local server endpoint such as `POST /api/ask`.
3. Launch Gemini in a headed persistent browser profile.
4. Detect hard-stop states before typing:
   - `accounts.google.com`
   - Google rejected-login page
   - CAPTCHA or human verification
5. Find the Gemini composer using `rich-textarea`, `contenteditable`, `role="textbox"`, and Korean aria-label candidates.
6. Clear the composer before every prompt with select-all and backspace.
7. Insert the prompt and submit by visible send button or keyboard fallback.
8. Extract the answer from text after `Gemini의 응답`.
9. Strip Gemini UI noise and the original prompt.
10. Return the answer to the webapp.
11. Reset Gemini to a new chat and verify the composer is empty.
12. Provide a manual fallback UI for blocked login/security states.

Read [references/implementation-notes.md](references/implementation-notes.md) before editing Gemini selector logic, response extraction, or reset behavior.

## Safety Requirements

- Do not implement CAPTCHA bypass, Cloudflare bypass, stealth plugins, or fingerprint spoofing.
- Do not automate high-volume use.
- Do not store credentials in the repo.
- Keep persistent browser profiles and raw logs under ignored `.local/` paths.
- When the target service blocks automation, report that clearly and route to manual fallback.

## Validation

Run these checks after changes:

```bash
npm run build
curl -s http://127.0.0.1:8787/api/health
curl -s -X POST http://127.0.0.1:8787/api/ask \
  -H 'Content-Type: application/json' \
  --data '{"question":"한 단어로 인사해줘."}'
```

Expected successful response shape:

```json
{
  "status": "complete",
  "answer": "...",
  "extractionStatus": "assistant-text"
}
```

After a successful response, verify Gemini is reset to a fresh chat:

```json
{
  "url": "https://gemini.google.com/app",
  "inputText": ""
}
```
