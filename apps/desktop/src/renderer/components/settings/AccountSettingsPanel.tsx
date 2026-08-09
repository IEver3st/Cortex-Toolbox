import { CreditCard, LogOut, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AccountStatus } from '../../../shared/contracts';
import { formatResultError } from '../../lib/result';
import { ActionButton } from '../ActionButton';

interface AccountSettingsPanelProps {
  SettingsGroup: (props: { title: string; children: React.ReactNode }) => React.JSX.Element;
}

export function AccountSettingsPanel({
  SettingsGroup,
}: AccountSettingsPanelProps): React.JSX.Element {
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [busy, setBusy] = useState<'refresh' | 'sign-in' | 'sign-out' | 'billing' | null>(
    'refresh',
  );

  useEffect(() => {
    let active = true;
    const dispose = window.cortex.account.onChanged((status) => {
      if (active) setAccount(status);
    });
    void window.cortex.account.status().then((result) => {
      if (active && result.ok) setAccount(result.data);
      if (active) setBusy(null);
    });
    return () => {
      active = false;
      dispose();
    };
  }, []);

  const run = async (kind: Exclude<typeof busy, 'refresh' | null>, action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The account action failed.');
    } finally {
      setBusy(null);
    }
  };

  const signIn = () =>
    run('sign-in', async () => {
      const result = await window.cortex.account.signIn();
      if (!result.ok) throw new Error(formatResultError(result.error));
      toast.message('Finish signing in in your browser.');
    });

  const signOut = () =>
    run('sign-out', async () => {
      const result = await window.cortex.account.signOut();
      if (!result.ok) throw new Error(formatResultError(result.error));
    });

  const checkout = (cadence: 'monthly' | 'annual') =>
    run('billing', async () => {
      const result = await window.cortex.account.checkout({ cadence });
      if (!result.ok) throw new Error(formatResultError(result.error));
    });

  const portal = () =>
    run('billing', async () => {
      const result = await window.cortex.account.portal();
      if (!result.ok) throw new Error(formatResultError(result.error));
    });

  if (!account || busy === 'refresh') {
    return (
      <SettingsGroup title="Cortex Account">
        <div className="settings-account-loading" role="status">
          <RefreshCw aria-hidden="true" /> Checking your local session…
        </div>
      </SettingsGroup>
    );
  }

  if (account.status !== 'signed-in' || !account.identity) {
    return (
      <SettingsGroup title="Cortex Account">
        <div className="settings-account-logged-out">
          <div className="settings-account-mark" aria-hidden="true">
            C
          </div>
          <div>
            <h2>
              {account.status === 'expired'
                ? 'Your Cortex session expired'
                : 'Sign in for managed Cortex AI'}
            </h2>
            <p>
              {account.status === 'expired'
                ? 'Sign in again to restore hosted usage. Local Toolbox functionality is unaffected.'
                : 'Sync an optional subscription and hosted usage. Toolbox itself never requires an account.'}
            </p>
          </div>
          <ActionButton
            variant="primary"
            busy={busy === 'sign-in'}
            disabled={!account.configured}
            onClick={() => void signIn()}
          >
            {account.status === 'expired' ? 'Sign in again' : 'Sign in'}
          </ActionButton>
        </div>
        {!account.configured ? (
          <p className="settings-note settings-account-config-note">
            Native authentication is unavailable because this build has no WorkOS client ID.
          </p>
        ) : null}
        {account.message ? (
          <p className="settings-inline-error" role="alert">
            {account.message}
          </p>
        ) : null}
      </SettingsGroup>
    );
  }

  const usagePercent = account.usage
    ? Math.min(100, Math.round((account.usage.used / account.usage.limit) * 100))
    : 0;
  return (
    <>
      <SettingsGroup title="Cortex Account">
        <div className="settings-account-profile">
          <div className="settings-account-avatar" aria-hidden="true">
            {account.identity.avatarUrl ? (
              <img src={account.identity.avatarUrl} alt="" />
            ) : (
              initials(account.identity.displayName)
            )}
          </div>
          <div className="settings-account-identity">
            <strong>{account.identity.displayName}</strong>
            <span>{account.identity.email}</span>
          </div>
          <span className={`settings-account-plan is-${account.plan ?? 'unknown'}`}>
            {account.plan === 'pro'
              ? 'AI Pro'
              : account.plan === 'free'
                ? 'Free'
                : 'Plan unavailable'}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Sign out of Cortex Account"
            disabled={busy !== null}
            onClick={() => void signOut()}
          >
            <LogOut aria-hidden="true" />
          </button>
        </div>
        {account.message ? (
          <p className="settings-inline-error" role="status">
            {account.message}
          </p>
        ) : null}
      </SettingsGroup>

      <SettingsGroup title="Managed AI usage">
        {account.usage ? (
          <div className="settings-account-usage">
            <div>
              <strong>{account.usage.remaining.toLocaleString()} requests remaining</strong>
              <span>
                {account.usage.used.toLocaleString()} / {account.usage.limit.toLocaleString()} used
                · resets {formatDate(account.usage.periodEnd)}
              </span>
            </div>
            <div
              className="settings-account-usage-track"
              role="progressbar"
              aria-label="Managed AI requests used"
              aria-valuemin={0}
              aria-valuemax={account.usage.limit}
              aria-valuenow={account.usage.used}
            >
              <span style={{ width: `${usagePercent}%` }} />
            </div>
          </div>
        ) : (
          <p className="settings-note">Usage is temporarily unavailable. BYOK remains available.</p>
        )}
      </SettingsGroup>

      <SettingsGroup title="Subscription">
        <div className="settings-account-billing">
          <div>
            <strong>{account.plan === 'pro' ? 'Cortex AI Pro' : 'Cortex Toolbox Free'}</strong>
            <p>
              {account.plan === 'pro'
                ? account.billing?.renewalDate
                  ? `Renews ${formatDate(account.billing.renewalDate)}. Managed by Stripe.`
                  : 'Managed by Stripe. Local and BYOK features remain independent.'
                : '25 hosted requests each month. Every local Toolbox module and BYOK stay free.'}
            </p>
          </div>
          <div className="settings-account-billing-actions">
            {account.plan === 'pro' ? (
              <ActionButton busy={busy === 'billing'} onClick={() => void portal()}>
                <CreditCard aria-hidden="true" /> Manage subscription
              </ActionButton>
            ) : (
              <>
                <ActionButton
                  variant="primary"
                  busy={busy === 'billing'}
                  onClick={() => void checkout('monthly')}
                >
                  Upgrade · $4.99/month
                </ActionButton>
                <button
                  type="button"
                  className="text-button compact"
                  disabled={busy !== null}
                  onClick={() => void checkout('annual')}
                >
                  $49.99 annually
                </button>
              </>
            )}
          </div>
        </div>
      </SettingsGroup>
    </>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'C'
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
