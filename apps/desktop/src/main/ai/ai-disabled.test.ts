import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from '../../shared/contracts';

vi.mock('./secure-storage', () => ({
  secureSecrets: {
    has: () => false,
    encryptionAvailable: () => true,
    get: () => null,
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

import { CortexAiService } from './ai-service';

describe('AI disabled boundary', () => {
  it('rejects network, context, chat, and proposal work before collecting workspace state', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const getRoot = vi.fn(() => 'C:\\workspace');
    const listFiles = vi.fn(() => Promise.resolve([]));
    const service = new CortexAiService(
      () => ({ ...DEFAULT_PREFERENCES, aiEnabled: false }),
      getRoot,
      listFiles,
      vi.fn(),
      vi.fn(),
      '',
    );

    await expect(service.models()).rejects.toThrow('disabled');
    expect(() =>
      service.start(
        {
          threadId: 'thread_01',
          model: 'deepseek/deepseek-v4-flash',
          messages: [],
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
