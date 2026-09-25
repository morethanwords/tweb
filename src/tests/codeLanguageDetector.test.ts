import {
  CodeLanguageDetectionRequest,
  CodeLanguageDetectionResponse,
  getCodeLanguageHint
} from '@/codeLanguageDetectorShared';

describe('code language detector', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  test.each([
    ['const answer = 42;', 'javascript'],
    ['interface User { id: number }', 'typescript'],
    ['print("hello")', 'python'],
    ['fn main() { println!("hello"); }', 'rust'],
    ['SELECT * FROM users', 'sql'],
    ['<?php echo "hello";', 'php']
  ])('recognizes a strong syntax hint in %s', (code, language) => {
    expect(getCodeLanguageHint(code)).toBe(language);
  });

  test('leaves plain text to the fallback detector', () => {
    expect(getCodeLanguageHint('hello world')).toBeUndefined();
  });

  test('detects a curated fallback language in the worker', async() => {
    let messageListener: (event: MessageEvent<CodeLanguageDetectionRequest>) => void;
    const responses: CodeLanguageDetectionResponse[] = [];
    vi.stubGlobal('self', {
      addEventListener: (type: string, listener: typeof messageListener) => {
        if(type === 'message') messageListener = listener;
      },
      postMessage: (response: CodeLanguageDetectionResponse) => responses.push(response)
    });

    await import('@/codeLanguageDetector.worker');
    messageListener(new MessageEvent('message', {
      data: {id: 7, code: '{"name":"Ada","active":true}'}
    }));

    expect(responses).toEqual([{id: 7, language: 'json'}]);
  });

  test('deduplicates equal pending and cached worker requests', async() => {
    const requests: CodeLanguageDetectionRequest[] = [];

    class FakeWorker extends EventTarget {
      postMessage(request: CodeLanguageDetectionRequest) {
        requests.push(request);
        queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
          data: {id: request.id, language: 'javascript'}
        })));
      }

      terminate() {}
    }

    vi.stubGlobal('Worker', FakeWorker);
    const {default: detectCodeLanguage} = await import('@/codeLanguageDetector');

    expect(await Promise.all([
      detectCodeLanguage('const value = 1;'),
      detectCodeLanguage('const value = 1;')
    ])).toEqual(['javascript', 'javascript']);
    expect(await detectCodeLanguage('const value = 1;')).toBe('javascript');
    expect(requests).toHaveLength(1);
  });

  test('matches concurrent worker responses by request id', async() => {
    class FakeWorker extends EventTarget {
      postMessage(request: CodeLanguageDetectionRequest) {
        const language = request.code.includes('SELECT') ? 'sql' : 'python';
        const delay = language === 'sql' ? 10 : 0;
        setTimeout(() => this.dispatchEvent(new MessageEvent('message', {
          data: {id: request.id, language}
        })), delay);
      }

      terminate() {}
    }

    vi.stubGlobal('Worker', FakeWorker);
    const {default: detectCodeLanguage} = await import('@/codeLanguageDetector');

    await expect(Promise.all([
      detectCodeLanguage('SELECT id FROM users'),
      detectCodeLanguage('print("hello")')
    ])).resolves.toEqual(['sql', 'python']);
  });

  test('uses the detected language with the existing Prism renderer', async() => {
    class FakeWorker extends EventTarget {
      postMessage(request: CodeLanguageDetectionRequest) {
        queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
          data: {id: request.id, language: 'javascript'}
        })));
      }

      terminate() {}
    }

    vi.stubGlobal('Worker', FakeWorker);
    const {highlightCodeAuto} = await import('@/codeLanguages');

    await expect(highlightCodeAuto('const answer = 42;')).resolves.toMatchObject({
      language: 'JavaScript',
      html: expect.stringContaining('prism-token prism-keyword')
    });
  });

  test('normalizes a detected alias to the language displayed and sent by the editor', async() => {
    class FakeWorker extends EventTarget {
      postMessage(request: CodeLanguageDetectionRequest) {
        queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
          data: {id: request.id, language: 'javascript'}
        })));
      }

      terminate() {}
    }

    vi.stubGlobal('Worker', FakeWorker);
    const {detectCodeLanguage} = await import('@/codeLanguages');
    await expect(detectCodeLanguage('const sent = true;')).resolves.toBe('JavaScript');
  });

  test('settles and stays retryable when the worker never answers', async() => {
    const requests: CodeLanguageDetectionRequest[] = [];
    let answer = false;

    class FakeWorker extends EventTarget {
      postMessage(request: CodeLanguageDetectionRequest) {
        requests.push(request);
        if(!answer) return; // wedged: no response, no error either
        queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
          data: {id: request.id, language: 'javascript'}
        })));
      }

      terminate() {}
    }

    vi.stubGlobal('Worker', FakeWorker);
    vi.useFakeTimers();
    try {
      const {default: detectCodeLanguage} = await import('@/codeLanguageDetector');
      const wedged = detectCodeLanguage('const value = 1;');
      await vi.advanceTimersByTimeAsync(5000);
      await expect(wedged).resolves.toBeUndefined();

      // The snippet must not stay cached as undetectable.
      answer = true;
      await expect(detectCodeLanguage('const value = 1;')).resolves.toBe('javascript');
      expect(requests).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test('falls back without throwing when Worker is unavailable', async() => {
    vi.stubGlobal('Worker', undefined);
    const {default: detectCodeLanguage} = await import('@/codeLanguageDetector');
    await expect(detectCodeLanguage('const value = 1;')).resolves.toBeUndefined();
  });
});
