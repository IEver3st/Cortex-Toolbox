import type { Preferences } from '../../../shared/contracts';
import type { FullThemeTokens } from '../../../shared/theme-schema';
import { resolveCodeFont } from '../../lib/theme/fonts';
import { resolvedColorMode } from '../../lib/theme/resolve';
import { Toggle } from '../UiPrimitives';

type PreviewMode = 'workspace' | 'editor' | 'dialog';

export function ThemeStudioPreview({
  mode,
  onModeChange,
  tokens,
  preferences,
  expanded,
  onToggleExpand,
}: {
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
  tokens: FullThemeTokens;
  preferences: Preferences;
  expanded: boolean;
  onToggleExpand: () => void;
}): React.JSX.Element {
  const codeFont = resolveCodeFont(preferences.codeFont).family;
  const resolvedMode = resolvedColorMode(preferences.colorMode);
  const wallpaper =
    resolvedMode === 'light' ? preferences.wallpaperBlendLight : preferences.wallpaperBlendDark;
  const effectiveOpacity = Math.round(
    100 - (wallpaper.wallpaperInfluence * (100 - wallpaper.sidebarOpacity)) / 100,
  );
  const previewStyle = {
    '--preview-signal': tokens.signal,
    '--preview-canvas': tokens.canvas,
    '--preview-surface': tokens.surface,
    '--preview-rail': tokens.rail,
    '--preview-ink': tokens.ink,
    '--preview-muted': tokens.mutedInk,
    '--preview-outline': tokens.outline,
    '--preview-editor': tokens.editorCanvas,
    '--preview-success': tokens.success,
    '--preview-warning': tokens.warning,
    '--preview-error': tokens.error,
    '--preview-info': tokens.informational,
    '--preview-diff-add': tokens.diffAddition,
    '--preview-diff-remove': tokens.diffRemoval,
    '--preview-selection': tokens.syntaxSelection,
    '--preview-code-font': codeFont,
    '--preview-code-size': `${preferences.editorFontSize}px`,
    '--preview-wallpaper-blur': `${Math.round(wallpaper.blurStrength / 5)}px`,
    '--preview-wallpaper-influence': `${wallpaper.wallpaperInfluence}%`,
    '--preview-wallpaper-tint': `${wallpaper.tintStrength}%`,
    '--preview-wallpaper-saturation': `${wallpaper.saturation}%`,
    '--preview-wallpaper-opacity': `${effectiveOpacity}%`,
  } as React.CSSProperties;

  return (
    <aside className={`theme-studio-preview${expanded ? ' is-expanded' : ''}`}>
      <div className="theme-studio-preview-toolbar">
        <div className="theme-preview-mode-tabs" role="tablist" aria-label="Preview mode">
          {(['workspace', 'editor', 'dialog'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={mode === tab}
              className={mode === tab ? 'is-active' : ''}
              onClick={() => onModeChange(tab)}
            >
              {tab === 'workspace' ? 'Workspace' : tab === 'editor' ? 'Editor' : 'Dialog'}
            </button>
          ))}
        </div>
        <button type="button" className="theme-preview-expand" onClick={onToggleExpand}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      <div
        className={`theme-studio-preview-stage${wallpaper.enabled ? ' has-wallpaper' : ''}${wallpaper.noiseTexture ? ' has-noise' : ''}`}
        style={previewStyle}
      >
        {mode === 'workspace' ? <WorkspacePreview /> : null}
        {mode === 'editor' ? <EditorPreview ligatures={preferences.codeLigatures} /> : null}
        {mode === 'dialog' ? <DialogPreview /> : null}
      </div>
    </aside>
  );
}

function WorkspacePreview(): React.JSX.Element {
  return (
    <div className="theme-preview-workspace" role="img" aria-label="Workspace preview">
      <div className="theme-preview-rail">
        <div className="theme-preview-rail-item is-active">Index</div>
        <div className="theme-preview-rail-item">Sentinel</div>
        <div className="theme-preview-rail-item">Bundle</div>
      </div>
      <div className="theme-preview-main">
        <h4>Resource overview</h4>
        <p>Validate manifests, audit scripts, and package releases from one workspace.</p>
        <p className="is-muted">Last indexed 2 minutes ago · 148 files</p>
        <div className="theme-preview-actions">
          <button type="button" className="is-primary">
            Run audit
          </button>
          <button type="button">Open manifest</button>
        </div>
        <div className="theme-preview-states">
          <span className="is-success">● Packaged</span>
          <span className="is-warning">● 2 warnings</span>
          <span className="is-error">● 1 error</span>
        </div>
        <label className="theme-preview-field">
          Resource name
          <input type="text" defaultValue="cortex_vehicle_pack" readOnly />
        </label>
        <div className="theme-preview-toggle-row">
          <span>Auto-validate on save</span>
          <Toggle id="preview-toggle" name="previewToggle" checked onChange={() => undefined} />
        </div>
      </div>
    </div>
  );
}

function EditorPreview({ ligatures }: { ligatures: boolean }): React.JSX.Element {
  return (
    <div
      className={`theme-preview-editor${ligatures ? ' has-ligatures' : ''}`}
      role="img"
      aria-label="Editor preview"
    >
      <div className="theme-preview-editor-gutter">
        <span>1</span>
        <span>2</span>
        <span className="is-current">3</span>
        <span>4</span>
        <span>5</span>
        <span>6</span>
      </div>
      <pre>
        <code>
          <span className="tok-key">fx_version</span> <span className="tok-str">'cerulean'</span>
          {'\n'}
          <span className="tok-key">game</span> <span className="tok-str">'gta5'</span>
          {'\n'}
          <span className="tok-key">author</span> <span className="tok-str">'Cortex Studio'</span>
          {'\n'}
          <span className="tok-cmt">-- vehicle metadata binding</span>
          {'\n'}
          <span className="tok-key">files</span> {'{'}
          {'\n'}
          {'  '}
          <span className="tok-str">'data/vehicles.meta'</span>,{'\n'}
          <span className="tok-warn"> -- missing stream folder reference</span>
          {'\n'}
          <span className="tok-diff-add">+ 'stream/taxi_hi.yft',</span>
          {'\n'}
          <span className="tok-diff-remove">- 'stream/taxi.yft',</span>
          {'\n'}
          {'}'}
        </code>
      </pre>
    </div>
  );
}

function DialogPreview(): React.JSX.Element {
  return (
    <div className="theme-preview-dialog-wrap" role="img" aria-label="Dialog preview">
      <div className="theme-preview-dialog">
        <h4>Save palette</h4>
        <p className="is-muted">Store this customization locally on this device.</p>
        <label>
          Palette name
          <input type="text" defaultValue="Night convoy" readOnly />
        </label>
        <label>
          Release branch
          <button type="button" className="theme-preview-select">
            Stable <span aria-hidden="true">▾</span>
          </button>
        </label>
        <div className="theme-preview-toggle-row">
          <span>Protect text contrast</span>
          <Toggle
            id="preview-dialog-toggle"
            name="previewDialogToggle"
            checked
            onChange={() => undefined}
          />
        </div>
        <div className="theme-preview-dialog-actions">
          <button type="button" className="is-destructive">
            Discard
          </button>
          <button type="button" className="is-primary">
            Save palette
          </button>
        </div>
        <div className="theme-preview-tooltip">Focus ring preview</div>
      </div>
    </div>
  );
}
