# API 없이 Gemini 웹 UI로 답변을 받아 웹앱에 표시한 구현 기록

최종 업데이트: 2026-06-24

## 목적

이 문서는 유료 AI API 키 없이, 로컬 웹앱에서 브라우저 자동화를 통해 AI 웹 UI에 질문을 보내고 답변을 받아오는 실전 구현 과정을 기록한다.

이번 구현의 최종 결과는 `example page/` 폴더의 Vite + React 웹앱이다. 사용자가 질문을 입력하면 로컬 Express 서버가 Playwright headed browser로 Gemini 웹 UI를 열고, 질문을 입력/전송한 뒤 Gemini의 답변을 추출해서 웹앱 결과 패널에 표시한다.

## 결론 요약

| 대상 | 결과 | 비고 |
| --- | --- | --- |
| ChatGPT | 제한적 사용 불가 | Cloudflare 사람 인증이 반복되어 자동화 브라우저가 막힘. CAPTCHA/anti-bot 우회는 하지 않음. |
| Gemini | 활용 가능 | Google/Gemini 웹 UI에서 입력창 탐지, 질문 전송, 답변 추출, 새 채팅 리셋까지 구현됨. |
| Copilot | 활용 가능 | API 없이 웹 UI 자동화 패턴 적용 가능 대상으로 정리. 서비스 정책과 로그인/보안 상태 확인 필요. |

핵심 판단은 다음과 같다.

1. ChatGPT 웹 UI는 Cloudflare 사람 인증에서 막히는 경우가 있어 안정적인 예시 타겟으로 부적합했다.
2. Gemini는 자동화 브라우저에서 입력창까지 접근 가능했고, 실제 질문 전송과 답변 추출이 가능했다.
3. Copilot도 API 없이 웹 UI 기반 자동화 타겟으로 활용 가능하다. 단, 계정 로그인, 보안 확인, UI 변경 대응은 Gemini와 동일하게 필요하다.
4. CAPTCHA, Cloudflare, Google 보안 경고를 우회하는 로직은 넣지 않는다. 사람이 직접 인증하거나 수동 fallback을 사용한다.

## 구현된 예시 앱

위치:

```txt
example page/
```

구성:

```txt
example page/
├── server/index.mjs
├── src/App.tsx
├── src/components/HolographicCube.tsx
├── src/styles.css
├── package.json
└── vite.config.ts
```

실행:

```bash
cd "example page"
npm install
npm run dev
```

로컬 URL:

```txt
http://127.0.0.1:5173/
```

로컬 API:

```txt
POST http://127.0.0.1:8787/api/ask
GET  http://127.0.0.1:8787/api/health
GET  http://127.0.0.1:8787/api/debug-page
```

`/api/debug-page`는 개발 중 DOM 상태를 확인하기 위한 로컬 디버그 endpoint다. 배포용 기능이 아니며 `127.0.0.1` 로컬 서버에서만 사용하는 전제다.

## 전체 아키텍처

```txt
React Webapp
-> POST /api/ask
-> Express local server
-> Playwright persistent browser
-> Gemini web UI
-> response extraction
-> reset to new Gemini chat
-> React result panel
```

브라우저 세션은 아래 경로에 저장된다.

```txt
example page/.local/gemini-profile/
```

raw response는 아래 경로에 저장된다.

```txt
example page/.local/raw-responses/
```

이 두 경로는 `.gitignore` 처리되어 GitHub에 올라가지 않는다.

## ChatGPT에서 막힌 지점

처음에는 ChatGPT 웹 UI를 Playwright headed browser로 열어 질문을 던지는 구조로 시작했다.

하지만 ChatGPT 접속 시 다음 화면이 반복됐다.

```txt
사람인지 확인하십시오
Cloudflare
```

체크박스를 직접 눌러도 자동화 브라우저 컨텍스트가 계속 신뢰되지 않는 경우가 있었다. 이는 로그인 실패라기보다 Cloudflare/OpenAI 쪽 anti-bot 또는 browser integrity 검사를 통과하지 못하는 상태로 보는 것이 맞다.

이 프로젝트에서는 다음을 하지 않았다.

- CAPTCHA 우회
- Cloudflare 우회
- stealth plugin 사용
- 브라우저 fingerprint 위조
- 대량 자동화

따라서 ChatGPT는 예시 앱의 기본 타겟에서 제외하고, 해당 실패 사례를 문서화했다.

## Gemini로 전환한 이유

Gemini는 같은 Playwright headed browser 방식에서 다음 상태를 확인할 수 있었다.

```json
{
  "title": "Google Gemini",
  "url": "https://gemini.google.com/app",
  "captcha": false,
  "unusualTraffic": false,
  "contenteditable": 2,
  "roleTextbox": 1
}
```

즉 Gemini는 첫 접근에서 Cloudflare 같은 사람 인증으로 바로 막히지 않았고, 실제 입력창 DOM도 노출되어 있었다.

최종적으로 다음 테스트가 성공했다.

```json
{
  "status": "complete",
  "answer": "안녕하세요.",
  "elapsedMs": 8944,
  "extractionStatus": "assistant-text"
}
```

## Gemini 구현 상세

### 1. Persistent browser profile

Gemini 로그인/세션 유지를 위해 Playwright persistent context를 사용한다.

```js
chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1280, height: 860 },
  args: ['--disable-dev-shm-usage'],
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});
```

Playwright Chromium 다운로드가 네트워크 타임아웃으로 실패할 수 있어, 시스템 Chrome을 우선 사용하도록 fallback을 넣었다.

### 2. Gemini 입력창 탐지

Gemini 입력창은 일반 `textarea`가 아니라 `rich-textarea` 내부의 `contenteditable` 요소로 노출된다.

실제 관찰된 입력창:

```txt
tag: div
aria-label: Gemini 프롬프트 입력
role: textbox
contenteditable: true
```

서버는 다음 selector를 순차 탐색한다.

```txt
rich-textarea div[contenteditable="true"]
[aria-label*="Enter a prompt"]
[aria-label*="프롬프트"]
[aria-label*="메시지"]
div[contenteditable="true"]
[role="textbox"]
textarea
```

일부 UI는 Shadow DOM 안쪽에 요소가 있을 수 있어 deep traversal fallback도 추가했다.

### 3. 질문 입력

Gemini 입력창은 이전 프롬프트가 남을 수 있다. 따라서 입력 전 항상 아래 순서로 비운다.

```txt
click composer
Meta+A 또는 Control+A
Backspace
insertText(prompt)
```

이 작업이 없으면 다음 질문이 이전 질문 뒤에 이어 붙거나, 응답 추출 시 현재 입력창의 프롬프트가 답변 후보로 섞일 수 있다.

### 4. 전송

Gemini 전송 버튼은 텍스트 입력 전에는 DOM에 없거나 비활성 상태일 수 있다.

서버는 먼저 버튼 click을 시도한다.

```txt
button[aria-label*="Send"]
button[aria-label*="보내기"]
button[aria-label*="Submit"]
button:has(mat-icon:has-text("send"))
[data-test-id*="send"]
[data-testid*="send"]
```

버튼을 못 찾으면 `Enter`, `Meta+Enter`, `Control+Enter`를 fallback으로 사용한다.

### 5. 답변 추출

Gemini 답변은 다음 텍스트 패턴으로 관찰됐다.

```txt
Gemini의 응답
안녕하세요.
```

따라서 `Gemini의 응답` 이후 텍스트를 우선 후보로 사용한다.

후처리에서 다음 노이즈를 제거한다.

```txt
Gemini의 응답
Gemini response
초안 보기
Flash
Gemini는 AI...
현재 입력창에 남은 프롬프트
```

짧은 답변도 안정적으로 처리하기 위해 완료 조건은 다음과 같이 잡았다.

```txt
best.length > 0
stableCount >= 2
stop button not visible
```

### 6. 응답 후 새 채팅으로 리셋

같은 Gemini 대화에 질문이 누적되면 다음 문제가 생긴다.

- 이전 답변이 추출 후보에 섞임
- 입력창에 이전 프롬프트가 남음
- 새 질문이 기존 대화 맥락의 영향을 받음

따라서 응답 추출 후 아래 작업을 수행한다.

```txt
Gemini 새 채팅/홈 링크 클릭 시도
실패하거나 /app/{conversationId}에 남아 있으면 /app으로 직접 이동
입력창이 비었는지 확인
```

검증된 reset 상태:

```json
{
  "url": "https://gemini.google.com/app",
  "inputText": "",
  "richTextarea": 1
}
```

## 실패와 대응 기록

### 로그인 링크 오판

Gemini 첫 화면에는 입력창이 있어도 상단에 `로그인` 버튼이 보인다. 처음에는 이 텍스트만 보고 “로그인 필요”로 오판했다.

수정:

- `accounts.google.com` URL일 때만 로그인 페이지로 판단
- 입력창을 먼저 찾고, 입력창이 없을 때만 로그인 힌트를 검사

### 답변 대신 입력창 프롬프트를 추출

Gemini는 답변 아래에 입력창이 계속 남아 있다. DOM 후보 중 마지막 요소가 입력창이면 프롬프트를 답변처럼 읽을 수 있다.

수정:

- `Gemini의 응답` 이후 텍스트를 우선 추출
- 현재 prompt 문자열을 제거
- Gemini UI 안내 문구를 제거

### 짧은 답변에서 90초 대기

처음에는 답변 길이가 80자 이상일 때만 완료로 봤다. `안녕!`, `안녕하세요.` 같은 짧은 답변은 timeout까지 기다렸다.

수정:

- 안정화 카운트가 2회 이상이고 답변 길이가 1자 이상이면 완료 가능

### Google rejected 화면

일부 상황에서 Google이 다음 화면을 보여줄 수 있다.

```txt
로그인할 수 없음
브라우저 또는 앱이 안전하지 않을 수 있습니다.
```

이 경우 자동 우회하지 않는다. 앱은 `waiting_login` 상태로 사용자에게 직접 브라우저 확인 또는 수동 fallback을 안내한다.

## Copilot 적용 메모

Copilot은 ChatGPT처럼 Cloudflare 사람 인증에 바로 막히는 구조보다 웹 UI 자동화 대상으로 활용 가능성이 높다. 이 프로젝트의 결론에서는 Gemini와 Copilot을 API 없이 웹 UI 자동화에 활용 가능한 대상으로 정리한다.

다만 Copilot도 다음 사항은 별도 확인해야 한다.

- Microsoft 계정 로그인
- 조직 계정 보안 정책
- 입력창 selector
- 전송 버튼 selector
- 응답 DOM selector
- 서비스 약관과 자동화 허용 범위

## 운영 원칙

1. CAPTCHA나 사람 인증을 우회하지 않는다.
2. 대량 요청 자동화에 쓰지 않는다.
3. 각 서비스의 약관과 계정 정책을 확인한다.
4. 자동화 실패를 정상 시나리오로 보고 수동 fallback을 제공한다.
5. raw response와 prompt를 로컬에 저장해 추적 가능하게 한다.
6. 입력창 selector와 응답 selector는 언제든 깨질 수 있으므로 디버그 endpoint를 유지한다.

## 현재 추천 구조

```txt
API 없이 AI 기능을 붙여야 할 때:

1. 로컬/온디바이스 모델이 가능하면 Ollama, llama.cpp, WebLLM 우선
2. 무료 웹 UI 자동화가 필요하면 Gemini 또는 Copilot 우선 검토
3. ChatGPT 웹 UI 자동화는 Cloudflare 사람 인증 반복 가능성을 문서화하고 fallback 전제로만 사용
```

