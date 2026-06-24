# Gemini Web Automation Implementation Notes

Use this reference when building or debugging an API-free Gemini web UI automation demo.

## Proven Local Stack

```txt
Frontend: Vite + React + TypeScript
Backend: Express local server
Browser automation: Playwright headed persistent context
Target: https://gemini.google.com/app
Profile: .local/gemini-profile
Response logs: .local/raw-responses
```

## Service Findings

| Service | Result | Notes |
| --- | --- | --- |
| ChatGPT | Blocked or unreliable | Cloudflare human verification can repeat even after manual checkbox interaction. Do not bypass. |
| Gemini | Works | Prompt input, send, response extraction, and reset-to-new-chat were implemented. |
| Copilot | Usable target | Treat as a viable web UI automation target, with account/security/selector validation required. |

## Gemini Selectors

Composer candidates:

```txt
rich-textarea div[contenteditable="true"]
[aria-label*="Enter a prompt"]
[aria-label*="프롬프트"]
[aria-label*="메시지"]
div[contenteditable="true"]
[role="textbox"]
textarea
```

Observed composer:

```txt
aria-label: Gemini 프롬프트 입력
role: textbox
contenteditable: true
```

Send button candidates:

```txt
button[aria-label*="Send"]
button[aria-label*="보내기"]
button[aria-label*="Submit"]
button:has(mat-icon:has-text("send"))
[data-test-id*="send"]
[data-testid*="send"]
```

Response extraction should prefer text after:

```txt
Gemini의 응답
```

Strip these noisy fragments:

```txt
Gemini의 응답
Gemini response
초안 보기
Flash
Gemini는 AI
the original prompt text
```

## Required Flow

1. Launch a headed persistent browser context.
2. Open `https://gemini.google.com/app`.
3. Detect hard browser actions:
   - `accounts.google.com`
   - rejected login screen
   - CAPTCHA or human verification
4. Find the Gemini composer.
5. Clear the composer with `Meta+A`/`Control+A` and `Backspace`.
6. Insert the prompt.
7. Click send or fallback to keyboard submit.
8. Poll response text until stable.
9. Save raw response locally.
10. Return response to the app.
11. Reset Gemini to a new chat screen and verify the composer is empty.

## Reset Rule

After a successful answer, reset the browser to a fresh Gemini chat.

Preferred:

```txt
click new chat/home target
```

Fallback:

```txt
goto https://gemini.google.com/app
```

Verify:

```json
{
  "url": "https://gemini.google.com/app",
  "inputText": "",
  "richTextarea": 1
}
```

## Safety Rules

- Do not bypass CAPTCHA, Cloudflare, or Google rejected-login pages.
- Do not add stealth plugins or browser fingerprint spoofing.
- Do not run high-volume automation.
- Always provide a manual fallback: copy prompt, open target web UI, paste answer back into the app.

