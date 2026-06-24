import express from 'express';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const profileDir = path.join(rootDir, '.local', 'gemini-profile');
const rawDir = path.join(rootDir, '.local', 'raw-responses');
const geminiUrl = process.env.GEMINI_URL || 'https://gemini.google.com/app';
const port = Number(process.env.PORT || 8787);
const systemChromePaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];

const app = express();
app.use(express.json({ limit: '1mb' }));

let context;
let page;

async function resolveBrowserLaunchOptions() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    return { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE };
  }

  for (const executablePath of systemChromePaths) {
    try {
      await fs.access(executablePath);
      return { executablePath };
    } catch {
      // Continue to Playwright-managed browsers if no system path exists.
    }
  }

  return {};
}

function buildPrompt(question) {
  return [
    'You are answering through a Gemini browser-automation demo inspired by sleeplesshan/api-free-ai-stack.',
    'Return a helpful answer to the user in Korean unless the user explicitly asks for another language.',
    'Keep the response practical and structured.',
    '',
    'User question:',
    question
  ].join('\n');
}

async function detectBrowserActionRequired(targetPage) {
  const url = targetPage.url();
  const bodyText = await targetPage.evaluate(() => document.body?.innerText || '').catch(() => '');
  const lowerText = bodyText.toLowerCase();
  const hasCloudflareWidget = await targetPage.locator('iframe[src*="cloudflare"], iframe[src*="challenges.cloudflare"]').count().catch(() => 0);

  if (url.includes('accounts.google.com') && (url.includes('rejected') || lowerText.includes('브라우저 또는 앱이 안전하지 않을 수 있습니다'))) {
    return 'Google이 이 자동화 브라우저 로그인을 안전하지 않은 브라우저로 거부했습니다. 열린 창에서 Gemini로 직접 돌아가거나, 일반 Chrome에서 Gemini를 사용한 뒤 수동 붙여넣기 fallback을 사용하세요.';
  }

  if (url.includes('accounts.google.com')) {
    return 'Gemini 사용을 위해 Google 로그인이 필요합니다. 열린 브라우저 창에서 직접 로그인한 뒤 앱에서 다시 질문을 보내세요. 로그인 세션은 .local/gemini-profile에 보존됩니다.';
  }

  if (
    url.includes('challenge') ||
    lowerText.includes('cloudflare') ||
    lowerText.includes('captcha') ||
    lowerText.includes('not a robot') ||
    lowerText.includes('human verification') ||
    lowerText.includes('verify you are human') ||
    lowerText.includes('사람인지 확인') ||
    lowerText.includes('사람인지 확인하십시오') ||
    lowerText.includes('로봇이 아님') ||
    hasCloudflareWidget > 0
  ) {
    return 'Gemini 또는 Google이 사람 인증을 요구하고 있습니다. 열린 브라우저 창에서 직접 통과한 뒤 앱에서 다시 질문을 보내세요. 이 데모는 CAPTCHA 우회나 stealth 처리를 하지 않습니다.';
  }

  return null;
}

async function ensurePage() {
  await fs.mkdir(profileDir, { recursive: true });
  await fs.mkdir(rawDir, { recursive: true });

  if (!context) {
    context = await launchGeminiContext();
  }

  try {
    page = context.pages().find((candidate) => !candidate.isClosed()) || await context.newPage();
  } catch {
    context = await launchGeminiContext();
    page = context.pages().find((candidate) => !candidate.isClosed()) || await context.newPage();
  }

  await page.bringToFront();

  if (!page.url().startsWith('https://gemini.google.com') && !page.url().startsWith('https://accounts.google.com')) {
    await page.goto(geminiUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(2500);

  return page;
}

async function launchGeminiContext() {
  const browserLaunchOptions = await resolveBrowserLaunchOptions();
  return chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 860 },
    args: ['--disable-dev-shm-usage'],
    ...browserLaunchOptions
  });
}

async function findComposer(targetPage) {
  const selectors = [
    'rich-textarea div[contenteditable="true"]',
    '[aria-label*="Enter a prompt"]',
    '[aria-label*="프롬프트"]',
    '[aria-label*="메시지"]',
    'div[contenteditable="true"]',
    '[role="textbox"]',
    'textarea'
  ];

  for (const selector of selectors) {
    const locator = targetPage.locator(selector);
    const count = await locator.count().catch(() => 0);

    for (let index = count - 1; index >= 0; index -= 1) {
      const candidate = locator.nth(index);
      const usable = await candidate.evaluate((node) => {
        const element = node;
        const style = window.getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const disabled = element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
        return Boolean(
          box.width > 4 &&
          box.height > 4 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          Number(style.opacity) !== 0 &&
          !disabled
        );
      }).catch(() => false);

      if (usable) return candidate;
    }
  }

  const deepHandle = await targetPage.evaluateHandle(() => {
    const all = [];
    const visit = (root) => {
      for (const node of root.querySelectorAll('*')) {
        all.push(node);
        if (node.shadowRoot) visit(node.shadowRoot);
      }
    };
    visit(document);

    const candidates = all.filter((node) => {
      const element = node;
      const aria = (element.getAttribute('aria-label') || '').toLowerCase();
      const role = element.getAttribute('role');
      const editable = element.getAttribute('contenteditable') === 'true';
      const tag = element.tagName.toLowerCase();
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const visible = box.width > 4 && box.height > 4 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0;
      return visible && (
        editable ||
        role === 'textbox' ||
        tag === 'textarea' ||
        aria.includes('prompt') ||
        aria.includes('message') ||
        aria.includes('프롬프트') ||
        aria.includes('메시지')
      );
    });

    return candidates[candidates.length - 1] || null;
  });

  const element = deepHandle.asElement();
  return element || null;
}

async function detectLoginHint(targetPage) {
  const bodyText = await targetPage.evaluate(() => document.body?.innerText || '').catch(() => '');
  const lowerText = bodyText.toLowerCase();

  if (
    lowerText.includes('google 계정으로 로그인') ||
    lowerText.includes('계정 선택') ||
    lowerText.includes('choose an account') ||
    lowerText.includes('use your google account')
  ) {
    return 'Gemini 사용을 위해 Google 로그인이 필요합니다. 열린 브라우저 창에서 직접 로그인한 뒤 앱에서 다시 질문을 보내세요. 로그인 세션은 .local/gemini-profile에 보존됩니다.';
  }

  return null;
}

async function submitPrompt(targetPage, composer, prompt) {
  await composer.click({ timeout: 8000 });
  const tagName = await composer.evaluate((node) => node.tagName.toLowerCase()).catch(() => '');

  try {
    if (tagName === 'textarea') {
      await composer.fill(prompt, { timeout: 6000 });
    } else {
      await targetPage.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
      await targetPage.keyboard.press('Backspace').catch(() => {});
      await targetPage.keyboard.insertText(prompt);
    }
  } catch {
    await composer.click({ force: true }).catch(() => {});
    await targetPage.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
    await targetPage.keyboard.press('Backspace').catch(() => {});
    await targetPage.keyboard.insertText(prompt);
  }

  await targetPage.waitForTimeout(350);

  const sendButton = targetPage.locator([
    'button[aria-label*="Send"]',
    'button[aria-label*="보내기"]',
    'button[aria-label*="Submit"]',
    'button:has(mat-icon:has-text("send"))',
    '[data-test-id*="send"]',
    '[data-testid*="send"]'
  ].join(', ')).last();
  if (await sendButton.isVisible().catch(() => false)) {
    await sendButton.click({ timeout: 5000 });
    return;
  }

  await targetPage.keyboard.press('Enter').catch(() => {});
  await targetPage.waitForTimeout(300);
  await targetPage.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter').catch(() => {});
}

function cleanGeminiAnswer(text) {
  return text
    .replace(/^Gemini의 응답\s*/i, '')
    .replace(/^Gemini response\s*/i, '')
    .replace(/^초안 보기\s*/i, '')
    .split('You are answering through a Gemini browser-automation demo')[0]
    .split('Flash')[0]
    .split('Gemini는 AI')[0]
    .replace(/\s*Google 앱\s*$/i, '')
    .trim();
}

async function extractAssistantText(targetPage, prompt) {
  const started = Date.now();
  let best = '';
  let stableCount = 0;
  let previous = '';

  while (Date.now() - started < 90000) {
    const texts = await targetPage.evaluate((inputPrompt) => {
      const candidates = [
        ...document.querySelectorAll('message-content'),
        ...document.querySelectorAll('model-response'),
        ...document.querySelectorAll('response-container'),
        ...document.querySelectorAll('.model-response-text'),
        ...document.querySelectorAll('.bard-markdown'),
        ...document.querySelectorAll('[data-response-index]'),
        ...document.querySelectorAll('[data-message-author-role="assistant"]'),
        ...document.querySelectorAll('[data-testid*="conversation-turn"]'),
        ...document.querySelectorAll('main article'),
        ...document.querySelectorAll('.markdown')
      ];

      const bodyText = document.body?.innerText || '';
      const responseParts = bodyText.split('Gemini의 응답');
      const bodyResponses = responseParts.length < 2
        ? []
        : responseParts.slice(1).map((part) => part.replace(inputPrompt, '').trim());

      return candidates
        .map((node) => (node.textContent || '').trim())
        .filter((text) => text.length > 20)
        .concat(bodyResponses);
    }, prompt).catch(() => []);

    const filtered = texts
      .map((text) => text.replace(prompt, '').trim())
      .map(cleanGeminiAnswer)
      .filter((text) => text && !text.includes('Google 약관') && !text.includes('Gemini는 AI'));

    if (filtered.length) best = filtered[filtered.length - 1];

    if (best && best === previous) stableCount += 1;
    if (best && best !== previous) stableCount = 0;
    previous = best;

    const stopVisible = await targetPage.locator('button[aria-label*="Stop"], button[aria-label*="중지"], button[aria-label*="응답 중지"]').first().isVisible().catch(() => false);
    if (best.length > 0 && stableCount >= 2 && !stopVisible) break;
    await targetPage.waitForTimeout(1200);
  }

  return best.trim();
}

async function resetGeminiConversation(targetPage) {
  const newChatTargets = [
    'a[href="/app"]',
    'a[href="https://gemini.google.com/app"]',
    'button[aria-label*="New chat"]',
    'button[aria-label*="새 채팅"]',
    'button[aria-label*="새 대화"]',
    'a[aria-label*="Gemini"]'
  ];

  let clicked = false;
  for (const selector of newChatTargets) {
    const target = targetPage.locator(selector).first();
    if (await target.isVisible().catch(() => false)) {
      await target.click({ timeout: 5000 }).catch(() => {});
      clicked = true;
      await targetPage.waitForTimeout(1200);
      break;
    }
  }

  const needsUrlReset = await targetPage.evaluate(() => {
    const input = document.querySelector('[role="textbox"], [contenteditable="true"]');
    return Boolean(input?.textContent?.trim());
  }).catch(() => true);

  if (!clicked || targetPage.url().match(/\/app\/[^/?#]+/) || needsUrlReset) {
    await targetPage.goto(geminiUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }

  await targetPage.waitForLoadState('domcontentloaded').catch(() => {});
  await targetPage.waitForTimeout(1800);

  if (targetPage.url().includes('accounts.google.com')) {
    return false;
  }

  const composer = await findComposer(targetPage);
  if (!composer) return false;

  await composer.click({ timeout: 5000 }).catch(() => {});
  return true;
}

function fallback(status, message, fallbackPrompt, elapsedMs) {
  return {
    status,
    message,
    fallbackPrompt,
    elapsedMs,
    extractionStatus: status === 'waiting_login' ? 'browser-action-required' : 'manual-fallback'
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, profileDir, rawDir });
});

app.get('/api/debug-page', async (_req, res) => {
  try {
    const targetPage = await ensurePage();
    await targetPage.waitForTimeout(5000);
    const snapshot = await targetPage.evaluate(() => {
      const deepAll = [];
      const visit = (root) => {
        for (const node of root.querySelectorAll('*')) {
          deepAll.push(node);
          if (node.shadowRoot) visit(node.shadowRoot);
        }
      };
      visit(document);

      const sample = (selector) => [...document.querySelectorAll(selector)].slice(0, 8).map((node) => {
        const element = node;
        const box = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.textContent || '').trim().slice(0, 160),
          aria: element.getAttribute('aria-label'),
          role: element.getAttribute('role'),
          contenteditable: element.getAttribute('contenteditable'),
          width: Math.round(box.width),
          height: Math.round(box.height),
          visible: box.width > 4 && box.height > 4
        };
      });
      const deepSample = deepAll.slice(0, 120).map((node) => {
        const element = node;
        const box = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.textContent || '').trim().slice(0, 120),
          aria: element.getAttribute('aria-label'),
          role: element.getAttribute('role'),
          contenteditable: element.getAttribute('contenteditable'),
          width: Math.round(box.width),
          height: Math.round(box.height),
          visible: box.width > 4 && box.height > 4
        };
      }).filter((item) => item.visible || item.aria || item.role || item.contenteditable);

      return {
        title: document.title,
        url: location.href,
        textSample: (document.body?.innerText || '').slice(0, 1000),
        counts: {
          richTextarea: document.querySelectorAll('rich-textarea').length,
          contenteditable: document.querySelectorAll('[contenteditable="true"]').length,
          roleTextbox: document.querySelectorAll('[role="textbox"]').length,
          textarea: document.querySelectorAll('textarea').length,
          sendButtons: document.querySelectorAll('button[aria-label*="Send"], button[aria-label*="보내기"], [data-testid*="send"], [data-test-id*="send"]').length,
          deepNodes: deepAll.length,
          deepEditable: deepAll.filter((node) => node.getAttribute?.('contenteditable') === 'true').length,
          deepTextbox: deepAll.filter((node) => node.getAttribute?.('role') === 'textbox').length
        },
        samples: {
          richTextarea: sample('rich-textarea'),
          contenteditable: sample('[contenteditable="true"]'),
          roleTextbox: sample('[role="textbox"]'),
          textarea: sample('textarea'),
          buttons: sample('button'),
          deep: deepSample
        }
      };
    });

    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown debug error' });
  }
});

app.post('/api/ask', async (req, res) => {
  const started = Date.now();
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';

  if (!question) {
    res.status(400).json({ status: 'error', message: 'Question is required.', elapsedMs: 0 });
    return;
  }

  const prompt = buildPrompt(question);

  try {
    const targetPage = await ensurePage();
    const browserActionMessage = await detectBrowserActionRequired(targetPage);

    if (browserActionMessage) {
      res.json(fallback(
        'waiting_login',
        browserActionMessage,
        prompt,
        Date.now() - started
      ));
      return;
    }

    const composer = await findComposer(targetPage);

    if (!composer) {
      const loginMessage = await detectLoginHint(targetPage);
      res.json(fallback(
        'waiting_login',
        loginMessage || 'Gemini 입력창을 찾지 못했습니다. 열린 브라우저에서 Google 로그인 또는 보안 확인 상태를 확인한 뒤 다시 시도하세요.',
        prompt,
        Date.now() - started
      ));
      return;
    }

    await submitPrompt(targetPage, composer, prompt);
    const answer = await extractAssistantText(targetPage, prompt);
    const elapsedMs = Date.now() - started;

    if (!answer) {
      res.json(fallback(
        'fallback',
        '응답 텍스트를 안정적으로 추출하지 못했습니다. 수동 fallback 프롬프트를 복사해 사용할 수 있습니다.',
        prompt,
        elapsedMs
      ));
      return;
    }

    await fs.writeFile(path.join(rawDir, `${Date.now()}.txt`), answer, 'utf8').catch(() => {});
    resetGeminiConversation(targetPage).catch((error) => {
      console.warn('Gemini reset failed:', error instanceof Error ? error.message : error);
    });

    res.json({
      status: 'complete',
      answer,
      elapsedMs,
      extractionStatus: 'assistant-text',
      rawLength: answer.length
    });
  } catch (error) {
    res.json(fallback(
      'error',
      error instanceof Error ? error.message : 'Unknown automation error',
      prompt,
      Date.now() - started
    ));
  }
});

process.on('SIGINT', async () => {
  await context?.close().catch(() => {});
  process.exit(0);
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Automation server listening on http://127.0.0.1:${port}`);
});
