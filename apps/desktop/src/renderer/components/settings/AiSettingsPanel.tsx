import type { CortexAiModel } from '@cortex/ai';
import { KeyRound, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Preferences } from '../../../shared/contracts';
import { clearAllAiHistory } from '../../ai/ai-store';
import { formatResultError } from '../../lib/result';
import { ActionButton } from '../ActionButton';
import { Select } from '../Select';
import { Toggle } from '../UiPrimitives';

interface AiSettingsPanelProps {
  draft: Preferences;
  update: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  SettingsGroup: (props: { title: string; children: React.ReactNode }) => React.JSX.Element;
  Row: (props: {
    label: string;
    description?: string;
    control: React.ReactNode;
    htmlFor?: string;
  }) => React.JSX.Element;
}

const FALLBACK_MODELS: CortexAiModel[] = [
  {
    id: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    tier: 'fast',
    contextLength: null,
    supportsTools: true,
    supportsStreaming: true,
    trainingPolicy: 'no-training',
  },
];

export function AiSettingsPanel({
  draft,
  update,
  SettingsGroup,
  Row,
}: AiSettingsPanelProps): React.JSX.Element {
  const [models, setModels] = useState<CortexAiModel[]>(FALLBACK_MODELS);
  const [registryState, setRegistryState] = useState<'idle' | 'loading' | 'live' | 'offline'>(
    'idle',
  );
  const [credential, setCredential] = useState({ configured: false, encryptionAvailable: true });
  const [apiKey, setApiKey] = useState('');
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);

  useEffect(() => {
    let active = true;
    void window.cortex.ai.credentialStatus().then((result) => {
      if (active && result.ok) setCredential(result.data);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!draft.aiEnabled) {
      setRegistryState('idle');
      return;
    }
    let active = true;
    setRegistryState('loading');
    // Settings persist after a short debounce. Wait for the main process to observe
    // the enabled preference before allowing its guarded registry request.
    const timer = window.setTimeout(() => {
      void window.cortex.ai.models().then((result) => {
        if (!active) return;
        if (result.ok && result.data.length > 0) {
          setModels(result.data);
          setRegistryState('live');
        } else {
          setRegistryState('offline');
        }
      });
    }, 500);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [draft.aiEnabled]);

  const saveCredential = async () => {
    setCredentialBusy(true);
    try {
      const result = await window.cortex.ai.setCredential({ apiKey: apiKey.trim() });
      if (!result.ok) throw new Error(formatResultError(result.error));
      setApiKey('');
      setCredential((current) => ({ ...current, configured: true }));
      toast.success('OpenRouter key encrypted on this device.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not store the API key.');
    } finally {
      setCredentialBusy(false);
    }
  };

  const removeCredential = async () => {
    setCredentialBusy(true);
    try {
      const result = await window.cortex.ai.removeCredential();
      if (!result.ok) throw new Error(formatResultError(result.error));
      setCredential((current) => ({ ...current, configured: false }));
      toast.success('OpenRouter key removed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the API key.');
    } finally {
      setCredentialBusy(false);
    }
  };

  const testProvider = async () => {
    setTesting(true);
    try {
      const result = await window.cortex.ai.testProvider();
      if (!result.ok) throw new Error(formatResultError(result.error));
      toast.success(
        `${result.data.provider === 'openrouter' ? 'OpenRouter' : 'Cortex Hosted'} is ready.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Provider test failed.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <SettingsGroup title="Cortex AI">
        <Row
          label="Enable Cortex AI"
          description="Adds the optional workspace inspector. No context is collected and no provider is contacted until you ask it to do something."
          htmlFor="enable-cortex-ai"
          control={
            <Toggle
              id="enable-cortex-ai"
              name="enableCortexAi"
              checked={draft.aiEnabled}
              onChange={(value) => update('aiEnabled', value)}
            />
          }
        />
      </SettingsGroup>

      {draft.aiEnabled ? (
        <>
          <SettingsGroup title="Provider">
            <Row
              label="AI provider"
              description="Hosted uses your optional Cortex account. BYOK requests go directly from Electron to OpenRouter."
              htmlFor="ai-provider"
              control={
                <Select
                  id="ai-provider"
                  value={draft.aiProvider}
                  options={[
                    { value: 'cortex-hosted', label: 'Cortex Hosted' },
                    { value: 'openrouter', label: 'My OpenRouter key' },
                  ]}
                  onChange={(value) => update('aiProvider', value)}
                />
              }
            />
            <Row
              label="Model"
              description={
                registryState === 'live'
                  ? 'Curated live OpenRouter models with tool and streaming support.'
                  : registryState === 'loading'
                    ? 'Checking the curated model registry…'
                    : 'Using the last verified Cortex model while the registry is unavailable.'
              }
              htmlFor="ai-model"
              control={
                <Select
                  id="ai-model"
                  value={draft.aiModel}
                  options={models.map((model) => ({
                    value: model.id,
                    label: `${model.tier === 'fast' ? 'Fast' : model.tier === 'advanced' ? 'Advanced' : 'Experimental'} · ${model.label}`,
                  }))}
                  onChange={(value) => update('aiModel', value)}
                />
              }
            />
            {draft.aiProvider === 'openrouter' ? (
              <div className="settings-secret-panel">
                <div className="settings-secret-heading">
                  <KeyRound aria-hidden="true" />
                  <div>
                    <strong>OpenRouter API key</strong>
                    <p>
                      {credential.configured
                        ? 'A key is encrypted with the operating system credential service.'
                        : 'The renderer can replace or remove this key, but can never read it back.'}
                    </p>
                  </div>
                  <span className={credential.configured ? 'is-configured' : ''}>
                    {credential.configured ? 'Configured' : 'Not configured'}
                  </span>
                </div>
                {!credential.encryptionAvailable ? (
                  <p className="settings-secret-warning">
                    Secure operating-system storage is unavailable, so Cortex will not retain a key.
                  </p>
                ) : null}
                <div className="settings-secret-controls">
                  <input
                    type="password"
                    value={apiKey}
                    name="openrouterKey"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={credential.configured ? 'Enter a replacement key' : 'sk-or-v1-…'}
                    aria-label="OpenRouter API key"
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                  <ActionButton
                    variant="primary"
                    className="compact"
                    disabled={!credential.encryptionAvailable || apiKey.trim().length < 16}
                    busy={credentialBusy}
                    onClick={() => void saveCredential()}
                  >
                    {credential.configured ? 'Replace' : 'Save key'}
                  </ActionButton>
                  {credential.configured ? (
                    <button
                      type="button"
                      className="icon-button"
                      disabled={credentialBusy}
                      aria-label="Remove OpenRouter key"
                      onClick={() => void removeCredential()}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="text-button compact"
                  disabled={!credential.configured || testing}
                  onClick={() => void testProvider()}
                >
                  {testing ? 'Testing connection…' : 'Test connection'}
                </button>
              </div>
            ) : (
              <p className="settings-note settings-ai-hosted-note">
                Cortex Hosted requires an account and an available managed allowance. Local Toolbox
                modules remain free and do not require sign-in.
              </p>
            )}
          </SettingsGroup>

          <SettingsGroup title="Workspace access">
            <Row
              label="Permission level"
              description="Destructive operations always require explicit confirmation. Session edit access is cleared when the workspace closes."
              htmlFor="ai-workspace-access"
              control={
                <Select
                  id="ai-workspace-access"
                  value={draft.aiWorkspaceAccess}
                  options={[
                    { value: 'read-only', label: 'Read only' },
                    { value: 'ask-before-changes', label: 'Ask before changes' },
                    { value: 'allow-session', label: 'Allow edits this session' },
                  ]}
                  onChange={(value) => update('aiWorkspaceAccess', value)}
                />
              }
            />
            <div className="settings-permission-explainer">
              <strong>
                {draft.aiWorkspaceAccess === 'read-only'
                  ? 'Inspection only'
                  : draft.aiWorkspaceAccess === 'allow-session'
                    ? 'Low-risk writes for this active workspace session'
                    : 'Reviewable proposals before every write'}
              </strong>
              <p>
                AI paths are workspace-relative, checked again in Electron, and denied if they
                traverse outside the root or resolve through an escaping symlink.
              </p>
            </div>
          </SettingsGroup>

          <SettingsGroup title="Privacy and local history">
            <div className="settings-ai-privacy">
              <p>
                Cortex sends the request, the visible context references, and only file excerpts
                selected through its typed tools. It never uploads the entire workspace by default.
              </p>
              <p>
                <code>.env</code>, private keys, certificates, and credential files are excluded
                from AI tools by default.
              </p>
            </div>
            <Row
              label="AI conversations"
              description="Conversation history is stored locally and separated by workspace."
              control={
                <button
                  type="button"
                  className={clearArmed ? 'is-armed' : ''}
                  onClick={() => {
                    if (!clearArmed) {
                      setClearArmed(true);
                      return;
                    }
                    clearAllAiHistory();
                    setClearArmed(false);
                    toast.success('Local AI conversation history cleared.');
                  }}
                >
                  {clearArmed ? 'Confirm clear' : 'Clear history'}
                </button>
              }
            />
          </SettingsGroup>
        </>
      ) : (
        <p className="settings-ai-disabled-note">
          Cortex AI is disabled. Its panel, contextual actions, shortcuts, context collection, and
          provider requests are inactive.
        </p>
      )}
    </>
  );
}
