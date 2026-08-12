import { describe, expect, it } from 'vitest';
import { finalizeColorDraft } from './color-draft';

describe('color token drafts', () => {
  it('normalizes complete hex colors before committing them', () => {
    expect(finalizeColorDraft('123456', '#2d353b')).toEqual({
      value: '#123456',
      shouldCommit: true,
    });
  });

  it('keeps the resolved color when a partial draft loses focus', () => {
    expect(finalizeColorDraft('#12', '#2d353b')).toEqual({
      value: '#2d353b',
      shouldCommit: false,
    });
  });
});
