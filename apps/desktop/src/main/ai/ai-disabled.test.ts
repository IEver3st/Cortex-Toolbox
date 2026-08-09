import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from '../../shared/contracts';

import { CortexAiService } from './ai-service';

describe('AI disabled boundary', () => {
  it('rejects network, context, chat, and proposal work before collecting workspace state', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const getRoot = vi.fn(() => 'C:\\workspace');
    const listFiles = vi.fn(() => Promise.resolve([]));
    const service = new CortexAiService(
      () => ({ ...DEFAULT_PREFERENCES, aiEnabled: false }),
      getRoot,
      listFiles,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      '',
    );

    expect(() =>
      service.start(
        {
          threadId: 'thread_01',
          reasoningMode: 'fast',
          messages: [
            {
              id: 'message-1',
              role: 'user',
              content: 'Inspect this workspace',
              createdAt: new Date(0).toISOString(),
              attachments: [],
            },
          ],
          attachments: [],
          activeModule: null,
          activeFile: null,
        },
        {} as never,
      ),
    ).toThrow('disabled');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getRoot).not.toHaveBeenCalled();
    expect(listFiles).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
