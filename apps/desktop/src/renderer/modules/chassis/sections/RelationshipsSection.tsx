import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { RelationshipLink } from '../types';

export function RelationshipsSection({
  links,
  issueCount,
}: {
  links: RelationshipLink[];
  issueCount: number;
}): React.JSX.Element {
  return (
    <div className="chassis-relationships-page">
      <header className="chassis-page-intro">
        <h2>Relationships</h2>
        <p>
          Cross-file references between model, handling, textures, audio, mod kits, and variations.
        </p>
      </header>

      {issueCount === 0 ? (
        <div className="module-success">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <strong>All checked references agree</strong>
            <p>Supported binding checks found no conflicts.</p>
          </div>
        </div>
      ) : (
        <p className="chassis-relationships-alert" role="status">
          <AlertTriangle aria-hidden="true" />
          {issueCount} relationship issue{issueCount === 1 ? '' : 's'} need attention.
        </p>
      )}

      <ul className="chassis-relationship-list">
        {links.map((link) => (
          <li key={link.id} className={`status-${link.status}`}>
            <div className="chassis-relationship-main">
              <strong>{link.label}</strong>
              <code>{link.value}</code>
              <small>{link.targetFile}</small>
            </div>
            <span className="chassis-relationship-status">{statusLabel(link.status)}</span>
            {link.detail ? <p>{link.detail}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function statusLabel(status: RelationshipLink['status']): string {
  switch (status) {
    case 'ok':
      return 'Linked';
    case 'missing':
      return 'Missing';
    case 'conflict':
      return 'Conflict';
    case 'warning':
      return 'Review';
  }
}
