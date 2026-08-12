import {
  AlertTriangle,
  ArrowUpRight,
  CreditCard,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AccountStatus } from '../../../shared/contracts';
import { formatResultError } from '../../lib/result';
import { ActionButton } from '../ActionButton';
import { CortexMark } from '../UiPrimitives';

interface AccountSettingsPanelProps {
  SettingsGroup: (props: { title: string; children: React.ReactNode }) => React.JSX.Element;
}

type AccountIdentity = NonNullable<AccountStatus['identity']>;
type PaidPlan = 'creator' | 'pro';
type BillingInterval = 'month' | 'year';

const PLAN_PRICE = {
  creator: { month: '$7.99 monthly', year: '$69.99 annually' },
  pro: { month: '$14.99 monthly', year: '$129.99 annually' },
} as const;

const USAGE_LABEL = {
  plenty: 'Plenty available',
  normal: 'Normal',
  nearing: 'Nearing monthly capacity',
  grace: 'Grace capacity',
  used: 'Monthly capacity used',
} as const;

export function AccountSettingsPanel({
  SettingsGroup,
}: AccountSettingsPanelProps): React.JSX.Element {
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [busy, setBusy] = useState<'refresh' | 'sign-in' | 'sign-out' | 'billing' | null>(
    'refresh',
  );
  const [interval, setInterval] = useState<BillingInterval>('month');
  const [showPlans, setShowPlans] = useState(false);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setBusy('refresh');
    const result = await window.cortex.account.status();
    if (result.ok) setAccount(result.data);
    if (!quiet) setBusy(null);
  }, []);

  useEffect(() => {
    let active = true;
    const dispose = window.cortex.account.onChanged((status) => {
      if (active) setAccount(status);
    });
    void window.cortex.account.status().then((result) => {
      if (active && result.ok) setAccount(result.data);
      if (active) setBusy(null);
    });
    const onFocus = () => void refresh(true);
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      dispose();
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

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

  const checkout = (plan: PaidPlan) =>
    run('billing', async () => {
      const result = await window.cortex.account.checkout({ plan, interval });
      if (!result.ok) throw new Error(formatResultError(result.error));
      toast.message('Checkout opened in your browser. Cortex AI activates after billing confirms.');
    });

  const portal = () =>
    run('billing', async () => {
      const result = await window.cortex.account.portal();
      if (!result.ok) throw new Error(formatResultError(result.error));
      toast.message('Billing opened in your browser.');
    });

  if (!account || busy === 'refresh') {
    return (
      <SettingsGroup title="Cortex Account">
        <div className="settings-account-loading" role="status">
          <RefreshCw aria-hidden="true" /> Checking your account…
        </div>
      </SettingsGroup>
    );
  }

  if (account.status !== 'signed-in' || !account.identity) {
    const expired = account.status === 'expired';
    return (
      <SettingsGroup title="Cortex Account">
        <div className="settings-account-logged-out">
          <div className="settings-account-mark" aria-hidden="true">
            <CortexMark size="medium" />
          </div>
          <div className="settings-account-copy">
            <div className="settings-account-meta">
              <span className="settings-account-kicker">ACCOUNT & BILLING</span>
              <span
                className={`settings-account-state ${expired ? 'is-attention' : account.configured ? 'is-ready' : ''}`}
              >
                <span className="settings-account-state-dot" aria-hidden="true" />
                {expired ? 'Session expired' : account.configured ? 'Signed out' : 'Unavailable'}
              </span>
            </div>
            <h2>
              {expired ? 'Your Cortex session expired' : 'Sign in to manage Cortex AI and billing'}
            </h2>
            <p>Toolbox and every local workflow remain free and available without an account.</p>
          </div>
          <ActionButton
            variant="primary"
            busy={busy === 'sign-in'}
            disabled={!account.configured}
            onClick={() => void signIn()}
          >
            {expired ? 'Sign in again' : 'Sign in'}
          </ActionButton>
        </div>
        <div className="settings-account-local-note">
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>Local-first by design.</strong> An account is only required for the paid hosted
            Cortex AI service.
          </span>
        </div>
        {account.message ? (
          <p className="settings-inline-error" role="alert">
            {account.message}
          </p>
        ) : null}
      </SettingsGroup>
    );
  }

  const plan = account.plan ?? 'free';
  const isPaid = plan === 'creator' || plan === 'pro';
  const usage = account.ai?.usage;
  const paymentWarning =
    account.billing?.paymentFailed === true || account.billing?.subscriptionStatus === 'past_due';

  return (
    <div className="settings-account-page">
      <SettingsGroup title="Cortex Account">
        <div className="settings-account-profile">
          <AccountAvatar
            key={account.identity.avatarUrl ?? account.identity.id}
            identity={account.identity}
          />
          <div className="settings-account-identity">
            <div className="settings-account-name-row">
              <strong>{account.identity.displayName}</strong>
              <span className="settings-account-signed-in">
                <span aria-hidden="true" /> Signed in
              </span>
            </div>
            <span>{account.identity.email}</span>
          </div>
          <div className="settings-account-profile-actions">
            <span className={`settings-account-plan is-${plan}`}>
              {plan === 'pro' ? 'AI Pro' : plan === 'creator' ? 'AI Creator' : 'Free'}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Refresh account and billing"
              disabled={busy !== null}
              onClick={() => void refresh()}
            >
              <RefreshCw aria-hidden="true" />
            </button>
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
        </div>
        {account.message ? (
          <p className="settings-account-notice" role="status">
            <span aria-hidden="true" />
            {account.message}
          </p>
        ) : null}
      </SettingsGroup>

      {paymentWarning ? (
        <div className="settings-billing-warning" role="status">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>We couldn’t process your latest payment.</strong>
            <span>Update your payment method to keep Cortex AI active.</span>
          </div>
          <ActionButton busy={busy === 'billing'} onClick={() => void portal()}>
            Manage billing
          </ActionButton>
        </div>
      ) : null}

      <SettingsGroup title="Cortex AI">
        <div className="settings-subscription-summary">
          <div>
            <strong>
              {plan === 'pro'
                ? 'Cortex AI Pro'
                : plan === 'creator'
                  ? 'Cortex AI Creator'
                  : 'Not included'}
            </strong>
            <span>
              {isPaid
                ? PLAN_PRICE[plan][account.billing?.interval ?? 'month']
                : 'Available with Creator or Pro.'}
            </span>
          </div>
          <span className={`settings-entitlement-state ${account.ai?.enabled ? 'is-ready' : ''}`}>
            <i aria-hidden="true" />
            {account.ai?.enabled ? 'Available' : isPaid ? 'Unavailable' : 'Upgrade required'}
          </span>
        </div>
      </SettingsGroup>

      {isPaid && usage ? (
        <SettingsGroup title="AI usage this month">
          <div className="settings-account-usage">
            <div>
              <strong>{USAGE_LABEL[usage.state]}</strong>
              <span>
                {usage.percent}% used
                {usage.resetsAt ? ` · resets ${formatDate(usage.resetsAt)}` : ''}
              </span>
            </div>
            <div
              className="settings-account-usage-track"
              role="progressbar"
              aria-label="Cortex AI monthly usage"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={usage.percent}
            >
              <span style={{ width: `${usage.percent}%` }} />
            </div>
          </div>
          {usage.state === 'nearing' || usage.state === 'grace' ? (
            <p className="settings-usage-guidance">
              You’re nearing this month’s Cortex AI capacity.
            </p>
          ) : null}
          {usage.state === 'used' ? (
            <p className="settings-usage-guidance is-used">
              You’ve used this month’s Cortex AI capacity.
              {plan === 'creator'
                ? ' Upgrade to Pro for more capacity.'
                : usage.resetsAt
                  ? ` It resets ${formatDate(usage.resetsAt)}.`
                  : ''}
            </p>
          ) : null}
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="Subscription">
        <div className="settings-account-billing">
          <div>
            <strong>
              {isPaid ? `Cortex AI ${plan === 'pro' ? 'Pro' : 'Creator'}` : 'Cortex Toolbox Free'}
            </strong>
            <p>
              {isPaid
                ? subscriptionTiming(account)
                : 'Local editors, validators, workspace tools, and every non-AI feature remain available.'}
            </p>
          </div>
          <div className="settings-account-billing-actions">
            {isPaid ? (
              <>
                <ActionButton busy={busy === 'billing'} onClick={() => void portal()}>
                  <CreditCard aria-hidden="true" /> Manage billing
                </ActionButton>
                {plan === 'creator' ? (
                  <ActionButton
                    variant="primary"
                    busy={busy === 'billing'}
                    onClick={() => void portal()}
                  >
                    Upgrade to Pro <ArrowUpRight aria-hidden="true" />
                  </ActionButton>
                ) : null}
              </>
            ) : (
              <ActionButton variant="primary" onClick={() => setShowPlans((value) => !value)}>
                {showPlans ? 'Hide plans' : 'View plans'}
              </ActionButton>
            )}
          </div>
        </div>

        {!isPaid && showPlans ? (
          <div className="settings-plan-picker">
            <div className="settings-plan-interval" role="group" aria-label="Billing interval">
              <button
                type="button"
                className={interval === 'month' ? 'is-selected' : ''}
                aria-pressed={interval === 'month'}
                onClick={() => setInterval('month')}
              >
                Monthly
              </button>
              <button
                type="button"
                className={interval === 'year' ? 'is-selected' : ''}
                aria-pressed={interval === 'year'}
                onClick={() => setInterval('year')}
              >
                Annual
              </button>
            </div>
            <PlanRow
              plan="creator"
              interval={interval}
              busy={busy === 'billing'}
              onChoose={checkout}
            />
            <PlanRow plan="pro" interval={interval} busy={busy === 'billing'} onChoose={checkout} />
            <p className="settings-plan-note">
              Checkout is hosted by Stripe. Cortex AI activates only after the signed billing
              webhook confirms your subscription.
            </p>
          </div>
        ) : null}
      </SettingsGroup>
    </div>
  );
}

function PlanRow({
  plan,
  interval,
  busy,
  onChoose,
}: {
  plan: PaidPlan;
  interval: BillingInterval;
  busy: boolean;
  onChoose: (plan: PaidPlan) => Promise<void>;
}): React.JSX.Element {
  const creator = plan === 'creator';
  return (
    <div className="settings-plan-row">
      <div>
        <strong>{creator ? 'Creator' : 'Pro'}</strong>
        <span>
          {PLAN_PRICE[plan][interval]}
          {interval === 'year' ? (creator ? ' · save $25.89' : ' · save $49.89') : ''}
        </span>
      </div>
      <ul>
        {creator ? (
          <>
            <li>Cortex AI with Fast + Advanced reasoning</li>
            <li>Workspace-aware edits and Creator capacity</li>
          </>
        ) : (
          <>
            <li>Everything in Creator with higher capacity</li>
            <li>Larger complex runs and higher concurrency</li>
          </>
        )}
      </ul>
      <ActionButton
        variant={creator ? 'default' : 'primary'}
        busy={busy}
        onClick={() => void onChoose(plan)}
      >
        Choose {creator ? 'Creator' : 'Pro'} <ArrowUpRight aria-hidden="true" />
      </ActionButton>
    </div>
  );
}

function subscriptionTiming(account: AccountStatus): string {
  const date = account.billing?.renewsAt;
  if (account.billing?.cancelAtPeriodEnd && date)
    return `Cancels ${formatDate(date)}. Access continues until then.`;
  if (date)
    return `Renews ${formatDate(date)} · ${account.billing?.interval === 'year' ? 'annual' : 'monthly'} billing.`;
  return 'Managed securely through Stripe.';
}

function AccountAvatar({ identity }: { identity: AccountIdentity }): React.JSX.Element {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className="settings-account-avatar" aria-hidden="true">
      <span className="settings-account-avatar-fallback">{initials(identity.displayName)}</span>
      {identity.avatarUrl && !imageFailed ? (
        <img
          className={imageLoaded ? 'is-loaded' : undefined}
          src={identity.avatarUrl}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
        />
      ) : null}
    </div>
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
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
