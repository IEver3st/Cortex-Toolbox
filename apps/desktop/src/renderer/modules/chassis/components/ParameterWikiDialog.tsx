import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, BookOpen, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  HANDLING_WIKI_ARTICLES,
  handlingWikiArticle,
  searchHandlingWiki,
  type HandlingWikiArticle,
} from '../handling-wiki';

function matchingExample(article: HandlingWikiArticle, query: string): string | null {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
  if (tokens.length === 0) return null;
  return (
    article.examples.find((item) => {
      const text = `${item.symptom} ${item.adjustment} ${item.outcome}`.toLowerCase();
      return tokens.some((token) => text.includes(token));
    })?.symptom ?? null
  );
}

export function ParameterWikiDialog({
  open,
  initialArticleId,
  onOpenChange,
}: {
  open: boolean;
  initialArticleId: string | null;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState(initialArticleId ?? HANDLING_WIKI_ARTICLES[0]?.id ?? '');
  const results = useMemo(() => searchHandlingWiki(query), [query]);
  const article = handlingWikiArticle(activeId) ?? results[0] ?? HANDLING_WIKI_ARTICLES[0] ?? null;

  useEffect(() => {
    if (!open) return;
    if (initialArticleId) setActiveId(initialArticleId);
  }, [initialArticleId, open]);

  const updateQuery = (value: string) => {
    setQuery(value);
    const first = searchHandlingWiki(value)[0];
    if (first) setActiveId(first.id);
  };

  const selectArticle = (id: string) => {
    setActiveId(id);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('.chassis-wiki-article')?.focus();
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay chassis-wiki-overlay" />
        <Dialog.Content className="chassis-wiki-dialog" aria-describedby="chassis-wiki-intro">
          <header className="chassis-wiki-header">
            <div>
              <span className="chassis-wiki-kicker">
                <BookOpen aria-hidden="true" /> Chassis reference
              </span>
              <Dialog.Title>Handling parameter wiki</Dialog.Title>
              <Dialog.Description id="chassis-wiki-intro">
                Search by parameter, symptom, or the behavior you want to change.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close handling parameter wiki">
              <X aria-hidden="true" />
            </Dialog.Close>
          </header>

          <div className="chassis-wiki-workbench">
            <aside className="chassis-wiki-index" aria-label="Wiki article index">
              <label className="chassis-wiki-search">
                <Search aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  autoFocus
                  placeholder="Try “wheelies under acceleration”"
                  aria-label="Search handling wiki"
                  onChange={(event) => updateQuery(event.currentTarget.value)}
                />
              </label>
              <div className="chassis-wiki-result-summary" aria-live="polite">
                {query.trim()
                  ? `${results.length} result${results.length === 1 ? '' : 's'}`
                  : `${HANDLING_WIKI_ARTICLES.length} articles`}
              </div>
              <nav aria-label="Handling wiki results">
                {results.length === 0 ? (
                  <p className="chassis-wiki-empty">
                    No exact match. Try the symptom, such as “rear spins under braking”.
                  </p>
                ) : (
                  results.map((result) => {
                    const match = matchingExample(result, query);
                    return (
                      <button
                        key={result.id}
                        type="button"
                        className={article?.id === result.id ? 'is-active' : ''}
                        aria-current={article?.id === result.id ? 'page' : undefined}
                        onClick={() => selectArticle(result.id)}
                      >
                        <span>{result.label}</span>
                        <code>{result.technicalName}</code>
                        {match ? <small>{match}</small> : null}
                      </button>
                    );
                  })
                )}
              </nav>
            </aside>

            {article ? (
              <article className="chassis-wiki-article" tabIndex={-1}>
                <header>
                  <span>{article.category}</span>
                  <h2>{article.label}</h2>
                  <code>{article.technicalName}</code>
                  <p>{article.summary}</p>
                </header>

                <section className="chassis-wiki-direction" aria-label="Direction of change">
                  <div>
                    <span>Increase</span>
                    <p>{article.increaseEffect}</p>
                  </div>
                  <div>
                    <span>Decrease</span>
                    <p>{article.decreaseEffect}</p>
                  </div>
                </section>

                <section className="chassis-wiki-caution">
                  <h3>What to watch</h3>
                  <p>{article.watchFor}</p>
                </section>

                <section className="chassis-wiki-examples">
                  <h3>Examples from the road</h3>
                  {article.examples.map((item) => (
                    <div key={item.symptom}>
                      <strong>{item.symptom}</strong>
                      <dl>
                        <div>
                          <dt>Try</dt>
                          <dd>{item.adjustment}</dd>
                        </div>
                        <div>
                          <dt>Goal</dt>
                          <dd>{item.outcome}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </section>

                {article.related.length > 0 ? (
                  <section className="chassis-wiki-related">
                    <h3>Check alongside</h3>
                    <div>
                      {article.related.map((relatedId) => {
                        const related = handlingWikiArticle(relatedId);
                        if (!related) return null;
                        return (
                          <button
                            key={related.id}
                            type="button"
                            onClick={() => selectArticle(related.id)}
                          >
                            {related.label}
                            <ArrowRight aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
              </article>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
