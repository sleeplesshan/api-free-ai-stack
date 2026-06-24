import { FormEvent, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Bot,
  Braces,
  CheckCircle2,
  Clipboard,
  Code2,
  Cpu,
  Loader2,
  LockKeyhole,
  RadioTower,
  Terminal,
  TriangleAlert
} from 'lucide-react';
import { HolographicCube } from './components/HolographicCube';

type AskStatus = 'idle' | 'launching' | 'waiting_login' | 'sending' | 'streaming' | 'complete' | 'fallback' | 'error';

type AskResponse = {
  status: AskStatus;
  answer?: string;
  fallbackPrompt?: string;
  message?: string;
  elapsedMs?: number;
  extractionStatus?: string;
  rawLength?: number;
};

const statusCopy: Record<AskStatus, string> = {
  idle: 'READY',
  launching: 'LAUNCHING BROWSER',
  waiting_login: 'WAITING LOGIN',
  sending: 'SENDING PROMPT',
  streaming: 'STREAMING RESPONSE',
  complete: 'COMPLETE',
  fallback: 'FALLBACK REQUIRED',
  error: 'ERROR'
};

const samplePrompts = [
  '이 기술스택으로 문서 요약 자동화를 만들 때 MVP 범위를 정리해줘.',
  'Playwright로 Gemini 웹 UI를 자동화할 때 가장 잘 깨지는 지점을 JSON으로 알려줘.',
  'api-free-ai-stack을 이용해 로컬 RAG 앱 아키텍처를 제안해줘.'
];

const stackLines = [
  ['frontend', 'React + Vite + Three.js'],
  ['runtime', 'Local Node automation bridge'],
  ['browser', 'Playwright persistent profile'],
  ['target', 'Gemini web UI headed mode'],
  ['contract', 'JSON-first prompt + parser fallback'],
  ['repo', 'sleeplesshan/api-free-ai-stack']
];

function formatMs(ms?: number) {
  if (!ms) return '0.0s';
  return `${(ms / 1000).toFixed(1)}s`;
}

function App() {
  const [question, setQuestion] = useState(samplePrompts[0]);
  const [result, setResult] = useState<AskResponse>({ status: 'idle' });
  const [copied, setCopied] = useState(false);
  const [manualAnswer, setManualAnswer] = useState('');

  const busy = useMemo(() => ['launching', 'sending', 'streaming'].includes(result.status), [result.status]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    const start = performance.now();
    setResult({ status: 'launching', message: '로컬 Playwright 브라우저 세션을 준비하고 있습니다.' });

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed })
      });

      const payload = (await response.json()) as AskResponse;
      setResult({
        ...payload,
        elapsedMs: payload.elapsedMs ?? Math.round(performance.now() - start)
      });
    } catch (error) {
      setResult({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown network error',
        elapsedMs: Math.round(performance.now() - start)
      });
    }
  }

  async function copyFallback() {
    const text = result.fallbackPrompt || question;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  function useManualAnswer() {
    const trimmed = manualAnswer.trim();
    if (!trimmed) return;
    setResult({
      status: 'complete',
      answer: trimmed,
      elapsedMs: result.elapsedMs,
      extractionStatus: 'manual-paste'
    });
    setManualAnswer('');
  }

  return (
    <main className="app-shell">
      <nav className="nav-bar">
        <div className="brand-lockup">
          <span className="brand-cube" />
          <span>API-Free Stack</span>
        </div>
        <div className="nav-links" aria-label="Sections">
          <a href="#demo">Demo</a>
          <a href="#stack">Stack</a>
          <a href="https://github.com/sleeplesshan/api-free-ai-stack" target="_blank" rel="noreferrer">GitHub</a>
        </div>
        <a className="nav-action" href="#demo">
          Run local demo <ArrowUpRight size={16} />
        </a>
      </nav>

      <section className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><span /> PROGRAMMABLE WEB AI</div>
          <h1>Ask Gemini without an API key. Watch the browser do the work.</h1>
          <p>
            A local demo that wraps the <strong>sleeplesshan/api-free-ai-stack</strong> pattern into a phosphor terminal interface: prompt contract, headed Gemini automation, extraction, and a human fallback path.
          </p>
          <div className="cta-row">
            <a className="primary-button" href="#demo"><Bot size={18} /> Ask through browser</a>
            <a className="ghost-button" href="#stack"><Code2 size={18} /> Inspect stack</a>
          </div>
        </div>

        <div className="visual-panel">
          <HolographicCube />
          <div className="scan-card top-card">
            <RadioTower size={17} /> headed chromium session
          </div>
          <div className="scan-card bottom-card">
            <Activity size={17} /> response extraction online
          </div>
        </div>
      </section>

      <section id="demo" className="console-section">
        <form className="question-console" onSubmit={ask}>
          <div className="panel-header">
            <div>
              <div className="eyebrow"><span /> LOCAL PROMPT COMPOSER</div>
              <h2>Gemini-style query surface</h2>
            </div>
            <div className={`status-pill status-${result.status}`}>
              {busy ? <Loader2 size={14} className="spin" /> : result.status === 'complete' ? <CheckCircle2 size={14} /> : result.status === 'error' || result.status === 'fallback' || result.status === 'waiting_login' ? <TriangleAlert size={14} /> : <Terminal size={14} />}
              {statusCopy[result.status]}
            </div>
          </div>

          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={5}
            placeholder="질문을 입력하면 로컬 서버가 Gemini 웹 UI를 열고 답변을 추출합니다."
          />

          <div className="sample-row">
            {samplePrompts.map((prompt) => (
              <button type="button" key={prompt} onClick={() => setQuestion(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <button className="submit-button" type="submit" disabled={busy || !question.trim()}>
            {busy ? <Loader2 size={18} className="spin" /> : <ArrowUpRight size={18} />}
            {busy ? 'Browser automation running' : 'Send to Gemini Web UI'}
          </button>
        </form>

        <aside className="result-console" aria-live="polite">
          <div className="panel-header compact">
            <div>
              <div className="eyebrow"><span /> RESPONSE BUFFER</div>
              <h2>Extracted answer</h2>
            </div>
            <div className="metric-pack">
              <span>{formatMs(result.elapsedMs)}</span>
              <span>{result.extractionStatus || 'idle parser'}</span>
            </div>
          </div>

          <div className="answer-window">
            {result.status === 'idle' && (
              <div className="empty-state">
                <Cpu size={32} />
                <p>질문을 보내면 Gemini 웹 UI에서 받은 답변이 여기에 표시됩니다.</p>
              </div>
            )}
            {busy && (
              <div className="stream-state">
                <Loader2 size={28} className="spin" />
                <p>{result.message || '브라우저 자동화가 진행 중입니다.'}</p>
              </div>
            )}
            {result.answer && <pre>{result.answer}</pre>}
            {(result.status === 'waiting_login' || result.status === 'fallback' || result.status === 'error') && (
              <div className="fallback-box">
                <LockKeyhole size={22} />
                <h3>{result.status === 'waiting_login' ? 'Browser action required' : result.status === 'fallback' ? 'Manual fallback path' : 'Automation error'}</h3>
                <p>{result.message || '자동화가 응답을 추출하지 못했습니다. 아래 프롬프트를 직접 Gemini에 붙여넣을 수 있습니다.'}</p>
                <div className="fallback-actions">
                  <button type="button" onClick={copyFallback}>
                    <Clipboard size={16} /> {copied ? 'Copied' : 'Copy fallback prompt'}
                  </button>
                  <a href="https://gemini.google.com/app" target="_blank" rel="noreferrer">
                    <ArrowUpRight size={16} /> Open Gemini
                  </a>
                </div>
                <textarea
                  className="manual-answer-input"
                  value={manualAnswer}
                  onChange={(event) => setManualAnswer(event.target.value)}
                  rows={5}
                  placeholder="Gemini에서 직접 받은 답변을 여기에 붙여넣으면 결과 패널에 표시됩니다."
                />
                <button type="button" onClick={useManualAnswer} disabled={!manualAnswer.trim()}>
                  <CheckCircle2 size={16} /> Use pasted answer
                </button>
              </div>
            )}
          </div>
        </aside>
      </section>

      <section id="stack" className="stack-section">
        <div className="stack-copy">
          <div className="eyebrow"><span /> STACK TRACE</div>
          <h2>API-free does not mean magic. It means a local control plane.</h2>
          <p>Every request goes through a visible browser session, a fixed prompt contract, and a parser that knows when to stop and hand control back to the human.</p>
        </div>
        <div className="code-block" role="img" aria-label="API-free AI stack trace">
          <div className="code-title"><Braces size={16} /> automation.pipeline</div>
          {stackLines.map(([key, value], index) => (
            <div className="code-line" key={key}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <code><b>{key}</b>: <em>{value}</em></code>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
