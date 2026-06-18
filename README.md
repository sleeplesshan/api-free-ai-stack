# API 없이 AI 기능을 붙이는 기술 스택 정리

최종 업데이트: 2026-06-18

이 문서는 외부 유료 AI API 키 없이 앱에 AI 기능을 넣기 위한 기술 스택과 구현 기능을 정리한 문서입니다. 여기서 말하는 "API 없이"는 보통 아래 세 가지 방식 중 하나를 뜻합니다.

1. 브라우저/앱 안에서 모델을 직접 실행하는 온디바이스 AI
2. 사용자의 PC나 사내 서버에서 로컬 모델 서버를 띄우는 로컬 AI
3. 사람이 쓰는 웹 UI를 보조적으로 자동화하는 RPA 방식

실서비스나 장기 운영 목적이라면 1번과 2번을 우선 권장합니다. 3번은 각 서비스 약관, 봇 탐지, 계정 제한, UI 변경 리스크가 크므로 내부 개인 자동화나 임시 프로토타입 수준에서만 검토하는 것이 안전합니다.

---

## 한 줄 결론

가장 현실적인 기본 스택은 다음 조합입니다.

```txt
Frontend: React / Next.js / SvelteKit
On-device inference: WebGPU + WebLLM 또는 Transformers.js
Local model runtime: Ollama 또는 llama.cpp
Local vector store: SQLite + sqlite-vec
Document parsing: pdf.js / mammoth / Tesseract OCR
Workflow layer: job queue + JSON schema validation + fallback UI
```

이 조합이면 요약, 분류, 태깅, 검색, RAG, 문서 질의응답, 로컬 챗봇, 간단한 에이전트 기능을 외부 AI API 없이 구현할 수 있습니다.

---

## 구현 가능한 AI 기능

### 1. 텍스트 생성과 챗봇

사용자가 입력한 프롬프트에 대해 로컬 LLM이 답변합니다.

추천 스택:

- 브라우저 단독: WebLLM
- 데스크톱/서버 로컬: Ollama, llama.cpp, LM Studio
- 프론트엔드 연동: OpenAI-compatible client를 로컬 endpoint로 연결

적합한 기능:

- 사내 문서 기반 챗봇
- 고객 응대 초안 생성
- 회의록 요약
- 이메일/공지문 초안 생성
- 코드 설명, 오류 원인 설명

주의할 점:

- 작은 모델은 빠르지만 추론 품질이 낮을 수 있습니다.
- 큰 모델은 RAM/VRAM 요구량이 커집니다.
- JSON 출력, 함수 호출, 장문 컨텍스트는 모델별 편차가 큽니다.

---

### 2. 요약, 분류, 태깅

LLM을 "대화 상대"가 아니라 "구조화된 JSON 생성기"처럼 사용합니다.

권장 출력 계약:

```json
{
  "summary": "",
  "tags": [],
  "category": "",
  "priority": "low",
  "action_required": false
}
```

필수 구현 기능:

- 프롬프트 템플릿
- JSON schema 고정
- 응답 파싱 실패 복구
- 원문과 raw response 로깅
- 재시도 또는 수동 fallback

적합한 기능:

- 고객 문의 자동 분류
- 뉴스/문서 태깅
- 업무 메모 요약
- 위험도/우선순위 판정

---

### 3. 로컬 RAG와 문서 질의응답

문서를 잘게 나누고, 각 조각의 embedding을 만든 뒤, 사용자 질문과 가까운 문서 조각을 찾아 LLM에 함께 넣는 구조입니다.

추천 구조:

```txt
문서 업로드
-> 텍스트 추출
-> chunk 분할
-> embedding 생성
-> SQLite/sqlite-vec에 저장
-> 질문 embedding 생성
-> 유사 chunk 검색
-> LLM에 context로 주입
-> 답변 + 출처 반환
```

추천 스택:

- 문서 추출: pdf.js, pdf-parse, mammoth, unstructured
- Embedding: Transformers.js, Ollama embedding model, sentence-transformers
- Vector store: sqlite-vec, SQLite-Vector, LanceDB, Chroma
- LLM: Ollama, llama.cpp, WebLLM

적합한 기능:

- PDF 기반 질의응답
- 회사 규정 검색
- 프로젝트 문서 검색
- 개인 지식 베이스
- 오프라인 매뉴얼 챗봇

구현 팁:

- chunk 크기는 500~1,000 tokens부터 시작합니다.
- 답변에는 반드시 사용된 chunk 출처를 함께 저장합니다.
- hallucination을 줄이려면 "문서에 없는 내용은 모른다고 답하라"는 규칙을 넣습니다.

---

### 4. 브라우저 안에서 돌아가는 AI

서버 없이 웹앱에서 바로 모델을 다운로드하고 실행합니다.

추천 스택:

- WebGPU: 브라우저 GPU 가속
- WebLLM: 브라우저 내 LLM 실행
- Transformers.js: 분류, 요약, embedding, speech, vision 등
- ONNX Runtime Web: ONNX 모델 실행

장점:

- 서버 비용이 거의 없습니다.
- 사용자의 데이터가 서버로 가지 않습니다.
- 초기 모델 다운로드 후 일부 기능은 오프라인처럼 동작할 수 있습니다.

단점:

- 브라우저와 디바이스 성능 편차가 큽니다.
- 첫 모델 다운로드가 큽니다.
- 모바일에서는 성능과 메모리 제약이 큽니다.
- WebGPU 지원 여부를 확인해야 합니다.

추천 UX:

- 최초 실행 시 모델 다운로드 진행률 표시
- 저사양 기기 감지 시 "가벼운 모델" 선택
- WebGPU 미지원 시 WASM/서버 로컬 모드 fallback
- 긴 작업은 Web Worker로 분리

---

### 5. 음성, OCR, 이미지 보조 기능

텍스트 LLM만으로 부족한 입력을 로컬 도구와 조합합니다.

음성 인식:

- whisper.cpp
- faster-whisper
- Transformers.js speech models

음성 합성:

- Piper
- Coqui TTS

OCR:

- Tesseract.js
- EasyOCR
- PaddleOCR

이미지/비전:

- Transformers.js vision models
- ONNX Runtime Web
- local vision-language model with Ollama or llama.cpp

적합한 기능:

- 음성 메모 자동 텍스트화
- 이미지 속 문서 OCR
- 영수증/명함 정보 추출
- 접근성용 읽어주기
- 오프라인 회의 녹취 요약

---

## 추천 아키텍처

### A. 순수 브라우저형

```txt
React/Svelte UI
-> Web Worker
-> WebLLM 또는 Transformers.js
-> IndexedDB 캐시
-> SQLite WASM 또는 in-memory vector search
```

선택 기준:

- 설치 없는 웹앱이 필요하다.
- 데이터가 브라우저 밖으로 나가면 안 된다.
- 사용자의 기기 성능을 활용해도 된다.

추천 기능:

- 간단한 챗봇
- 문서 요약
- 짧은 텍스트 분류
- 브라우저 기반 semantic search

---

### B. 로컬 데스크톱형

```txt
Tauri/Electron 앱
-> local backend
-> Ollama 또는 llama.cpp
-> SQLite + sqlite-vec
-> 파일 시스템 문서 인덱싱
```

선택 기준:

- 사용자가 PC에 설치해도 된다.
- 파일 시스템 접근이 필요하다.
- 큰 문서와 개인 지식 베이스를 다룬다.

추천 기능:

- 개인 문서 AI 비서
- 로컬 코드베이스 분석
- 사내 PC용 오프라인 검색
- 로컬 회의록 정리 앱

---

### C. 사내 서버형

```txt
Web frontend
-> Backend API
-> 사내 GPU/CPU 서버
-> Ollama/llama.cpp/vLLM
-> PostgreSQL 또는 SQLite vector store
-> 인증/권한/감사 로그
```

선택 기준:

- 여러 사용자가 같은 모델을 쓴다.
- 중앙 관리와 접근 제어가 필요하다.
- 모델과 문서를 사내망에만 둔다.

추천 기능:

- 사내 지식 검색
- 부서별 문서 챗봇
- 고객 상담 보조
- 민감 데이터 비공개 분석

---

### D. 웹 UI 자동화형

```txt
업무 앱
-> Prompt Builder
-> Playwright/Selenium
-> AI 웹 UI
-> 응답 추출
-> JSON parser
-> 업무 객체 변환
```

선택 기준:

- 공식 API를 쓰지 못하는 임시 상황이다.
- 사용자가 직접 웹 UI를 사용할 권한이 있다.
- 내부 자동화나 개인 생산성 도구다.

필수 안전장치:

- 서비스 약관 확인
- 자동화 전용 브라우저 프로필
- Headed mode 우선
- CAPTCHA/로그인 실패 수동 fallback
- raw response 저장
- JSON parser 재시도
- UI selector 변경 대응

운영 리스크:

- 서비스 UI 변경으로 자동화가 깨질 수 있습니다.
- 계정 제한이나 봇 탐지에 걸릴 수 있습니다.
- 상업적/대량 자동화는 약관 위반 가능성이 큽니다.

---

## 기능별 추천 스택 표

| 기능 | 브라우저 단독 | 로컬 PC/서버 | 저장소 |
| --- | --- | --- | --- |
| 챗봇 | WebLLM | Ollama, llama.cpp, LM Studio | 대화 로그 DB |
| 요약/분류 | Transformers.js, WebLLM | Ollama, llama.cpp | SQLite |
| Embedding | Transformers.js | Ollama embeddings, sentence-transformers | sqlite-vec, LanceDB |
| 문서 QA | WebLLM + IndexedDB | Ollama + SQLite | sqlite-vec |
| OCR | Tesseract.js | Tesseract, PaddleOCR | 파일/DB |
| 음성 인식 | Transformers.js | whisper.cpp, faster-whisper | 파일/DB |
| 이미지 분석 | ONNX Runtime Web | local VLM | 파일/DB |
| 웹 UI 자동화 | Playwright | Playwright/Selenium | raw logs |

---

## MVP 구현 순서

1. API 없이 구현할 기능을 하나만 고릅니다.
2. 출력 JSON schema를 먼저 고정합니다.
3. 자동화 없이 수동 입력/수동 결과 붙여넣기 흐름을 만듭니다.
4. 로컬 모델 런타임을 붙입니다.
5. JSON parser와 fallback을 안정화합니다.
6. 문서 기반 기능이면 embedding과 vector store를 추가합니다.
7. 모델 다운로드, 캐시, 진행률, 오류 상태를 UI에 노출합니다.
8. 성능 측정 후 작은 모델/큰 모델 선택지를 나눕니다.

---

## 최소 구현 예시

### Ollama를 로컬 LLM으로 쓰는 흐름

```bash
ollama pull llama3.2
ollama run llama3.2
```

앱에서는 `localhost`의 Ollama 서버로 요청합니다. 이 방식은 외부 유료 API 키 없이 동작하지만, 앱 내부 관점에서는 로컬 HTTP endpoint를 호출하는 구조입니다.

### 브라우저에서 Transformers.js로 embedding 생성

```js
import { pipeline } from "@huggingface/transformers";

const extractor = await pipeline(
  "feature-extraction",
  "Xenova/all-MiniLM-L6-v2"
);

const output = await extractor("검색할 문장", {
  pooling: "mean",
  normalize: true
});
```

### JSON 출력 강제 프롬프트

```txt
다음 텍스트를 분석하세요.
응답은 마크다운 없이 JSON 객체 하나만 반환하세요.

스키마:
{
  "summary": "",
  "tags": [],
  "risk": "low|medium|high",
  "action_required": false
}

텍스트:
{{input_text}}
```

---

## 운영 체크리스트

- [ ] 모델 라이선스가 서비스 목적과 맞는가?
- [ ] 사용자의 기기에서 모델이 실제로 돌아가는가?
- [ ] WebGPU 미지원 환경 fallback이 있는가?
- [ ] 첫 모델 다운로드 UX가 있는가?
- [ ] 응답이 JSON이 아닐 때 복구할 수 있는가?
- [ ] raw prompt와 raw response를 저장하는가?
- [ ] 민감 데이터가 외부로 나가지 않는가?
- [ ] 로컬 서버를 외부 네트워크에 노출하지 않았는가?
- [ ] RAG 답변에 출처 chunk를 저장하는가?
- [ ] 성능 기준을 작게라도 측정했는가?

---

## 추천 레포 구조

```txt
api-free-ai-app/
├── apps/
│   ├── web/
│   └── desktop/
├── packages/
│   ├── ai-runtime/
│   ├── prompt-contracts/
│   ├── document-ingest/
│   ├── vector-store/
│   └── fallback-parser/
├── models/
│   └── README.md
├── docs/
│   ├── architecture.md
│   ├── model-selection.md
│   └── web-ui-automation.md
└── README.md
```

---

## 참고 자료

- [WebLLM](https://webllm.mlc.ai/) - 브라우저에서 WebGPU 기반 LLM 추론
- [WebLLM GitHub](https://github.com/mlc-ai/web-llm) - OpenAI-compatible API 형태의 브라우저 LLM 엔진
- [Transformers.js](https://huggingface.co/docs/transformers.js/en/index) - 브라우저/Node.js에서 Transformers 모델 실행
- [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html) - JavaScript 환경에서 ONNX 모델 실행
- [ONNX Runtime WebGPU](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html) - WebGPU execution provider
- [llama.cpp](https://github.com/ggml-org/llama.cpp) - C/C++ 기반 로컬 LLM 추론
- [Ollama Quickstart](https://docs.ollama.com/quickstart) - macOS, Windows, Linux 로컬 모델 실행
- [LM Studio Local Server](https://lmstudio.ai/docs/developer/core/server) - 로컬 LLM 서버와 호환 API
- [sqlite-vec](https://github.com/asg017/sqlite-vec) - SQLite용 로컬 vector search extension
- [Mozilla Builders sqlite-vec 소개](https://builders.mozilla.org/project/sqlite-vec/) - 온디바이스 RAG와 semantic search 용도

---

## 결론

외부 AI API 없이 AI 기능을 만들려면 핵심은 "무료 웹 UI를 억지로 API처럼 쓰는 것"이 아니라, 가능한 한 모델 실행과 데이터 검색을 사용자 기기 또는 사내 인프라 안으로 가져오는 것입니다.

권장 출발점은 다음입니다.

1. 짧은 요약/분류: Transformers.js 또는 Ollama
2. 챗봇: Ollama 또는 WebLLM
3. 문서 질의응답: Ollama + SQLite + sqlite-vec
4. 설치 없는 웹앱: WebGPU + WebLLM
5. 임시 웹 UI 자동화: Playwright + JSON parser + 수동 fallback

