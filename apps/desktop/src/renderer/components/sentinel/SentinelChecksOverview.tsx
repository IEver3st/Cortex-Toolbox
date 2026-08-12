import { ChevronDown } from 'lucide-react';
import { COVERAGE_CHECKS } from './constants';

const OUT_OF_SCOPE = [
  'Runtime behavior or script correctness',
  'Full security audit or dependency CVEs',
  'Whether the resource starts cleanly on a live server',
];

export function SentinelChecksOverview(): React.JSX.Element {
  return (
    <details className="sentinel-checks">
      <summary>
        <span className="sentinel-section-label">What Sentinel checks</span>
        <ChevronDown aria-hidden="true" className="sentinel-checks-chevron" />
      </summary>
      <div className="sentinel-checks-body">
        <div className="sentinel-checks-columns">
          {COVERAGE_CHECKS.map((group) => (
            <section key={group.id} aria-label={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="sentinel-checks-footnote">
          <strong>Out of scope:</strong> {OUT_OF_SCOPE.join(' · ')}
        </p>
      </div>
    </details>
  );
}
