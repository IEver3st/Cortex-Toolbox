import { ArrowLeft, ArrowRight, Check, LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CURRENT_ONBOARDING_VERSION,
  type AccountStatus,
  type Preferences,
} from '../../shared/contracts';
import { THEME_PRESETS } from '../lib/themes';
import { formatResultError } from '../lib/result';
import { ActionButton } from './ActionButton';
import { Select } from './Select';
import { WindowControls } from './TitleBar';

type OnboardingStep = 'welcome' | 'appearance' | 'ai' | 'behavior' | 'complete';

const ORDER: OnboardingStep[] = ['welcome', 'appearance', 'ai', 'behavior', 'complete'];

export function Onboarding({
  preferences,
  save,
}: {
  preferences: Preferences;
  save: (patch: Partial<Preferences>) => Promise<void>;
}): React.JSX.Element {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let active = true;
    const dispose = window.cortex.account.onChanged((status) => active && setAccount(status));
    void window.cortex.account.status().then((result) => {
      if (active && result.ok) setAccount(result.data);
    });
    return () => {
      active = false;
      dispose();
    };
  }, []);

  const go = (next: OnboardingStep) => setStep(next);
  const next = () => {
    if (step === 'ai' && !preferences.aiEnabled) {
      go('complete');
      return;
    }
    const index = ORDER.indexOf(step);
    go(ORDER[Math.min(index + 1, ORDER.length - 1)] ?? 'complete');
  };
  const back = () => {
    const index = ORDER.indexOf(step);
    if (step === 'complete' && !preferences.aiEnabled) go('ai');
    else go(ORDER[Math.max(0, index - 1)] ?? 'welcome');
  };

  const signIn = async () => {
    setAccountBusy(true);
    try {
      const result = await window.cortex.account.signIn();
      if (!result.ok) throw new Error(formatResultError(result.error));
      toast.message('Finish signing in in your browser. You can continue setup here.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cortex sign-in could not start.');
    } finally {
      setAccountBusy(false);
    }
  };

  const startCheckout = async (plan: 'creator' | 'pro') => {
    setAccountBusy(true);
    try {
      const result = await window.cortex.account.checkout({ plan, interval: 'month' });
      if (!result.ok) throw new Error(formatResultError(result.error));
      toast.message('Checkout opened in your browser. Setup can continue while billing confirms.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cortex checkout could not start.');
    } finally {
      setAccountBusy(false);
    }
  };

  const finish = async () => {
    setFinishing(true);
    try {
      await save({ onboardingVersion: CURRENT_ONBOARDING_VERSION });
    } catch (error) {
      setFinishing(false);
      toast.error(error instanceof Error ? error.message : 'Could not finish setup.');
    }
  };

  const accountReady = account?.status === 'signed-in';
  const accountAiEntitled = account?.ai?.entitled === true;
  const stepNumber =
    step === 'welcome' ? 0 : step === 'complete' ? 4 : Math.max(1, ORDER.indexOf(step));

  return (
    <div
      className={`onboarding-shell${step === 'welcome' ? ' is-welcome' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Cortex setup"
    >
      <header className="onboarding-titlebar">
        {stepNumber > 0 ? (
          <span className="onboarding-titlebar-status">Setup {stepNumber} of 4</span>
        ) : null}
        <WindowControls />
      </header>

      <main className="onboarding-stage" key={step}>
        {step === 'welcome' ? (
          <section className="onboarding-welcome">
            <h1>CORTEX TOOLBOX</h1>
            <p className="onboarding-tagline">Free tools for people who make things.</p>
            <button type="button" className="primary onboarding-primary" onClick={next}>
              Get started <ArrowRight aria-hidden="true" />
            </button>
          </section>
        ) : null}

        {step === 'appearance' ? (
          <section className="onboarding-page">
            <div className="onboarding-heading">
              <p className="onboarding-kicker">APPEARANCE</p>
              <h1>Make the toolbox yours.</h1>
              <p>These are the same appearance settings used throughout Cortex.</p>
            </div>
            <div className="onboarding-setting">
              <div>
                <strong>Interface mode</strong>
                <span>Follow Windows or choose a fixed appearance.</span>
              </div>
              <div className="onboarding-segment" role="group" aria-label="Interface mode">
                {(['system', 'dark', 'light'] as const).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    className={preferences.colorMode === mode ? 'is-selected' : ''}
                    aria-pressed={preferences.colorMode === mode}
                    onClick={() => void save({ colorMode: mode })}
                  >
                    {mode[0]?.toUpperCase()}
                    {mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="onboarding-setting">
              <div>
                <strong>Theme</strong>
                <span>Choose one of the built-in Cortex palettes.</span>
              </div>
              <Select
                id="onboarding-theme"
                ariaLabel="Cortex theme"
                value={preferences.themePreset}
                options={THEME_PRESETS.map((theme) => ({ value: theme.id, label: theme.name }))}
                onChange={(themePreset) =>
                  void save({ themePreset, selectedPaletteId: themePreset })
                }
              />
            </div>
            <div className="onboarding-preview" aria-label="Live appearance preview">
              <span />
              <div>
                <i />
                <i />
                <i />
              </div>
              <section>
                <strong>Active workspace</strong>
                <p>Appearance changes apply to the real Cortex interface immediately.</p>
              </section>
            </div>
          </section>
        ) : null}

        {step === 'ai' ? (
          <section className="onboarding-page">
            <div className="onboarding-heading">
              <p className="onboarding-kicker">CORTEX AI</p>
              <h1>Use Cortex AI?</h1>
              <p>
                Cortex can understand the active workspace, inspect files through protected tools,
                diagnose problems, and prepare eligible changes. It also works directly with
                supported tools such as Chassis. AI is completely optional.
              </p>
            </div>
            <div className="onboarding-choice-list" role="group" aria-label="Use Cortex AI">
              <button
                type="button"
                className={preferences.aiEnabled ? 'is-selected' : ''}
                aria-pressed={preferences.aiEnabled}
                onClick={() => void save({ aiEnabled: true })}
              >
                <span className="settings-choice-indicator" aria-hidden="true" />
                <span>
                  <strong>Enable Cortex AI</strong>
                  <small>Workspace help is available when you ask for it.</small>
                </span>
              </button>
              <button
                type="button"
                className={!preferences.aiEnabled ? 'is-selected' : ''}
                aria-pressed={!preferences.aiEnabled}
                onClick={() => void save({ aiEnabled: false })}
              >
                <span className="settings-choice-indicator" aria-hidden="true" />
                <span>
                  <strong>Not now</strong>
                  <small>
                    No AI requests or workspace AI context. Toolbox stays fully functional.
                  </small>
                </span>
              </button>
            </div>
            {preferences.aiEnabled ? (
              <>
                <div className={`onboarding-account-row${accountReady ? ' is-connected' : ''}`}>
                  <div className="onboarding-account-copy">
                    <span className="onboarding-account-icon" aria-hidden="true">
                      <LogIn />
                    </span>
                    <div>
                      <div className="onboarding-account-eyebrow">
                        <span
                          className={`onboarding-account-status${accountReady ? ' is-ready' : ''}`}
                          aria-hidden="true"
                        />
                        <span>{accountReady ? 'CONNECTED ACCOUNT' : 'OPTIONAL ACCOUNT'}</span>
                      </div>
                      <strong>
                        {accountReady
                          ? accountAiEntitled
                            ? 'Cortex AI is ready'
                            : 'Choose a Cortex AI plan'
                          : 'Sign in for Cortex AI'}
                      </strong>
                      <small>
                        {accountReady
                          ? accountAiEntitled
                            ? `${account.identity?.email} · ${account.plan === 'pro' ? 'Pro' : 'Creator'}`
                            : `${account.identity?.email} · Free accounts have no hosted AI usage.`
                          : 'Hosted AI is paid and optional. Local tools never require an account.'}
                      </small>
                    </div>
                  </div>
                  {!accountReady ? (
                    <ActionButton
                      className="onboarding-account-action"
                      busy={accountBusy}
                      disabled={account?.configured === false}
                      onClick={() => void signIn()}
                    >
                      Sign in or create account <ArrowRight aria-hidden="true" />
                    </ActionButton>
                  ) : (
                    <Check className="onboarding-account-check" aria-label="Signed in" />
                  )}
                </div>
                {accountReady && !accountAiEntitled ? (
                  <div className="onboarding-plan-rows" aria-label="Choose a Cortex AI plan">
                    <button
                      type="button"
                      disabled={accountBusy}
                      onClick={() => void startCheckout('creator')}
                    >
                      <span>
                        <strong>Creator</strong>
                        <small>Fast + Advanced reasoning · Creator capacity</small>
                      </span>
                      <b>$7.99/mo</b>
                    </button>
                    <button
                      type="button"
                      disabled={accountBusy}
                      onClick={() => void startCheckout('pro')}
                    >
                      <span>
                        <strong>Pro</strong>
                        <small>Higher capacity, larger runs, higher concurrency</small>
                      </span>
                      <b>$14.99/mo</b>
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}

        {step === 'behavior' ? (
          <section className="onboarding-page">
            <div className="onboarding-heading">
              <p className="onboarding-kicker">HOW CORTEX WORKS</p>
              <h1>Choose reasoning and autonomy.</h1>
              <p>You can change either setting later.</p>
            </div>
            <fieldset className="onboarding-fieldset">
              <legend>Reasoning</legend>
              <div className="onboarding-choice-list is-horizontal">
                {(
                  [
                    ['fast', 'Fast', 'Quick responses for everyday work.'],
                    [
                      'advanced',
                      'Advanced',
                      'Maximum reasoning for difficult debugging and complex changes.',
                    ],
                  ] as const
                ).map(([value, title, detail]) => (
                  <button
                    type="button"
                    key={value}
                    className={preferences.reasoningMode === value ? 'is-selected' : ''}
                    aria-pressed={preferences.reasoningMode === value}
                    onClick={() => void save({ reasoningMode: value })}
                  >
                    <span className="settings-choice-indicator" aria-hidden="true" />
                    <span>
                      <strong>{title}</strong>
                      <small>{detail}</small>
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="onboarding-fieldset">
              <legend>Permissions</legend>
              <div className="onboarding-choice-list is-compact">
                {(
                  [
                    [
                      'ask-before-changes',
                      'Ask before changes',
                      'Cortex shows proposed edits before applying them.',
                    ],
                    [
                      'approve-safe-edits',
                      'Approve safe edits',
                      'Eligible low-risk edits use the protected write flow with fewer prompts.',
                    ],
                    [
                      'approve-all',
                      'Approve all',
                      'Apply eligible workspace changes automatically. Safety checks and rollback still apply.',
                    ],
                  ] as const
                ).map(([value, title, detail]) => (
                  <button
                    type="button"
                    key={value}
                    className={preferences.aiWorkspaceAccess === value ? 'is-selected' : ''}
                    aria-pressed={preferences.aiWorkspaceAccess === value}
                    onClick={() => void save({ aiWorkspaceAccess: value })}
                  >
                    <span className="settings-choice-indicator" aria-hidden="true" />
                    <span>
                      <strong>{title}</strong>
                      <small>{detail}</small>
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          </section>
        ) : null}

        {step === 'complete' ? (
          <section className="onboarding-complete">
            <span className="onboarding-complete-mark" aria-hidden="true">
              <Check />
            </span>
            <p className="onboarding-kicker">READY</p>
            <h1>Your toolbox is set.</h1>
            <div className="onboarding-summary">
              <span>
                <strong>Appearance</strong>
                {THEME_PRESETS.find((theme) => theme.id === preferences.themePreset)?.name ??
                  'Cortex'}{' '}
                · {preferences.colorMode}
              </span>
              <span>
                <strong>Cortex AI</strong>
                {preferences.aiEnabled
                  ? accountAiEntitled
                    ? `Enabled · ${preferences.reasoningMode}`
                    : accountReady
                      ? 'Enabled · Creator or Pro required'
                      : 'Enabled · sign in required'
                  : 'Off'}
              </span>
              {preferences.aiEnabled ? (
                <span>
                  <strong>Permissions</strong>
                  {preferences.aiWorkspaceAccess === 'approve-all'
                    ? 'Approve all'
                    : preferences.aiWorkspaceAccess === 'approve-safe-edits'
                      ? 'Approve safe edits'
                      : 'Ask before changes'}
                </span>
              ) : null}
            </div>
            <ActionButton
              variant="primary"
              busy={finishing}
              busyLabel="Finishing setup…"
              onClick={() => void finish()}
            >
              Open Cortex Toolbox <ArrowRight aria-hidden="true" />
            </ActionButton>
          </section>
        ) : null}
      </main>

      {step !== 'welcome' && step !== 'complete' ? (
        <footer className="onboarding-footer">
          <button type="button" className="text-button" onClick={back}>
            <ArrowLeft aria-hidden="true" /> Back
          </button>
          <button type="button" className="primary" onClick={next}>
            Continue <ArrowRight aria-hidden="true" />
          </button>
        </footer>
      ) : null}
      {step === 'complete' ? (
        <button type="button" className="onboarding-back-link text-button" onClick={back}>
          <ArrowLeft aria-hidden="true" /> Back
        </button>
      ) : null}
    </div>
  );
}
