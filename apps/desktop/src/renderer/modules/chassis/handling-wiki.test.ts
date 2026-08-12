import { HANDLING_FIELDS } from '@cortex/vehicle-meta';
import { describe, expect, it } from 'vitest';
import { HANDLING_WIKI_ARTICLES, handlingWikiArticle, searchHandlingWiki } from './handling-wiki';

describe('handling parameter wiki', () => {
  it('covers every scalar handling field with actionable guidance and multiple examples', () => {
    for (const field of HANDLING_FIELDS) {
      const article = handlingWikiArticle(field.key);
      expect(article?.label).toBe(field.label);
      expect(article?.increaseEffect.length).toBeGreaterThan(20);
      expect(article?.decreaseEffect.length).toBeGreaterThan(20);
      expect(article?.examples.length).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(HANDLING_WIKI_ARTICLES.map((article) => article.id)).size).toBe(
      HANDLING_WIKI_ARTICLES.length,
    );
    expect(HANDLING_WIKI_ARTICLES).toHaveLength(HANDLING_FIELDS.length + 3);
    expect(
      HANDLING_WIKI_ARTICLES.reduce((total, article) => total + article.examples.length, 0),
    ).toBeGreaterThanOrEqual(126);
  });

  it('finds useful parameters from a plain-language driving symptom', () => {
    const results = searchHandlingWiki('pitching too far forward causing the vehicle to wheelie');
    expect(results[0]?.id).toBe('centreOfMass');
    expect(results.map((article) => article.id)).toContain('fInitialDriveForce');

    const corneringResults = searchHandlingWiki(
      'suspension is not leaning into corners, too much understeer',
    );
    expect(corneringResults[0]?.id).toBe('fSuspensionBiasFront');
    expect(corneringResults.map((article) => article.id)).toContain('fAntiRollBarForce');
    expect(corneringResults.map((article) => article.id)).toContain('fAntiRollBarBiasFront');
  });

  it('supports technical names, labels, and related article links', () => {
    expect(searchHandlingWiki('fBrakeBiasFront')[0]?.id).toBe('fBrakeBiasFront');
    expect(searchHandlingWiki('rear spins under braking')[0]?.id).toBe('fBrakeBiasFront');
    for (const article of HANDLING_WIKI_ARTICLES) {
      for (const relatedId of article.related) {
        expect(handlingWikiArticle(relatedId), `${article.id} -> ${relatedId}`).toBeDefined();
      }
    }
  });
});
