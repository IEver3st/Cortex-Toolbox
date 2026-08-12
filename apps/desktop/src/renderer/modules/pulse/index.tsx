import {
  binaryToDecimal,
  parseSirenPattern,
  serializeSirenPattern,
  type SirenPattern,
} from '@cortex/vehicle-meta';
import {
  ArrowLeft,
  ArrowRight,
  Clipboard,
  Download,
  Pause,
  Play,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Toggle } from '../../components/UiPrimitives';
import { useWorkbenchDraftStore } from '../../store/workbench';
import { downloadText } from '../shared/download';
import {
  createEmptyPattern,
  normalizePulsePattern,
  PULSE_CHANNEL_COUNT as SIREN_CHANNEL_COUNT,
  PULSE_STEP_COUNT as SIREN_STEP_COUNT,
  readPulseStudio,
  writePulseStudio,
  type PulsePreset,
} from './storage';

const COLOR_PALETTE = [
  '#ff4050',
  '#2788e8',
  '#ffffff',
  '#ffb936',
  '#25df82',
  '#9b6cff',
  '#52d6dc',
  '#ff72bd',
];

const CHANNEL_IDS = Array.from({ length: SIREN_CHANNEL_COUNT }, (_, index) => `siren-${index + 1}`);
const STEP_IDS = Array.from({ length: SIREN_STEP_COUNT }, (_, index) => `tick-${index + 1}`);

const getStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

const presetId = (): string => {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `pulse-${Date.now()}`;
  }
};

const moveCellFocus = (
  event: React.KeyboardEvent<HTMLButtonElement>,
  row: number,
  column: number,
) => {
  const movements: Record<string, [number, number]> = {
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    Home: [0, -column],
    End: [0, SIREN_STEP_COUNT - 1 - column],
  };
  const movement = movements[event.key];
  if (!movement) return;
  event.preventDefault();
  const nextRow = Math.min(SIREN_CHANNEL_COUNT - 1, Math.max(0, row + movement[0]));
  const nextColumn = Math.min(SIREN_STEP_COUNT - 1, Math.max(0, column + movement[1]));
  document
    .querySelector<HTMLButtonElement>(`[data-pulse-cell="${nextRow}-${nextColumn}"]`)
    ?.focus();
};

export default function Pulse(): React.JSX.Element {
  const setPulseDraft = useWorkbenchDraftStore((state) => state.setPulse);
  const [initialStudio] = useState(() => readPulseStudio(getStorage()));
  const [name, setName] = useState(initialStudio.pattern.name);
  const [bpm, setBpm] = useState(initialStudio.pattern.bpm);
  const [sirenId, setSirenId] = useState(initialStudio.pattern.sirenId ?? 254);
  const [channels, setChannels] = useState(initialStudio.pattern.channels);
  const [colors, setColors] = useState(initialStudio.pattern.colors);
  const [glow, setGlow] = useState(initialStudio.glow);
  const [presets, setPresets] = useState<PulsePreset[]>(initialStudio.presets);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [colorDraft, setColorDraft] = useState(colors[0] ?? '#ffffff');
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const paintValue = useRef<boolean | null>(null);

  useEffect(() => {
    if (!playing) return;
    const handle = window.setInterval(
      () => setStep((value) => (value + 1) % SIREN_STEP_COUNT),
      Math.max(35, 60_000 / Math.max(1, bpm)),
    );
    return () => window.clearInterval(handle);
  }, [bpm, playing]);

  useEffect(() => {
    const stopPainting = () => {
      paintValue.current = null;
    };
    window.addEventListener('pointerup', stopPainting);
    window.addEventListener('pointercancel', stopPainting);
    return () => {
      window.removeEventListener('pointerup', stopPainting);
      window.removeEventListener('pointercancel', stopPainting);
    };
  }, []);

  const pattern = useMemo<SirenPattern>(
    () => ({ name, bpm, sirenId, colors, channels }),
    [bpm, channels, colors, name, sirenId],
  );

  useEffect(() => {
    setPulseDraft(pattern);
  }, [pattern, setPulseDraft]);

  useEffect(() => {
    const handle = window.setTimeout(
      () => writePulseStudio(getStorage(), { pattern, glow, presets }),
      150,
    );
    return () => window.clearTimeout(handle);
  }, [glow, pattern, presets]);

  useEffect(() => {
    setColorDraft(colors[selectedChannel] ?? '#ffffff');
  }, [colors, selectedChannel]);

  const applyPattern = (value: SirenPattern) => {
    const next = normalizePulsePattern(value);
    setName(next.name);
    setBpm(next.bpm);
    setSirenId(next.sirenId ?? 254);
    setChannels(next.channels);
    setColors(next.colors);
    setPlaying(false);
    setStep(0);
  };

  const setCell = (row: number, column: number, active: boolean) =>
    setChannels((current) =>
      current.map((channel, channelIndex) =>
        channelIndex === row
          ? channel.map((value, position) => (position === column ? active : value))
          : channel,
      ),
    );

  const transformSelectedChannel = (transform: (channel: boolean[]) => boolean[]) =>
    setChannels((current) =>
      current.map((channel, index) => (index === selectedChannel ? transform(channel) : channel)),
    );

  const shiftSelectedChannel = (offset: -1 | 1) =>
    transformSelectedChannel((channel) =>
      channel.map(
        (_, index) => channel[(index - offset + SIREN_STEP_COUNT) % SIREN_STEP_COUNT] === true,
      ),
    );

  const setSelectedColor = (color: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    const normalized = color.toLowerCase();
    setColors((current) =>
      current.map((value, index) => (index === selectedChannel ? normalized : value)),
    );
    setColorDraft(normalized);
  };

  const exportPattern = (format: 'xml' | 'dat' | 'json') => {
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'pattern';
    downloadText(
      format === 'xml' ? 'carcols.meta' : `pulse-${slug}.${format}`,
      serializeSirenPattern(pattern, format),
      format === 'json' ? 'application/json' : 'text/plain',
    );
  };

  const importPattern = async (file: File | undefined) => {
    if (!file) return;
    try {
      applyPattern(parseSirenPattern(await file.text()));
      setSelectedPresetId(null);
      toast.success(`Imported ${file.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not import that Pulse file.');
    }
  };

  const savePreset = () => {
    const presetName = name.trim();
    if (!presetName) {
      toast.error('Name the pattern before saving a preset.');
      return;
    }
    const match = presets.find((preset) => preset.name.toLowerCase() === presetName.toLowerCase());
    const next: PulsePreset = {
      id: match?.id ?? presetId(),
      name: presetName,
      savedAt: new Date().toISOString(),
      pattern: normalizePulsePattern({ ...pattern, name: presetName }),
    };
    setPresets((current) =>
      match
        ? current.map((preset) => (preset.id === match.id ? next : preset))
        : [next, ...current],
    );
    setSelectedPresetId(next.id);
    toast.success(match ? `Updated ${presetName}` : `Saved ${presetName}`);
  };

  const loadPreset = (preset: PulsePreset) => {
    applyPattern(preset.pattern);
    setSelectedPresetId(preset.id);
    toast.success(`Loaded ${preset.name}`);
  };

  const deletePreset = (preset: PulsePreset) => {
    const originalIndex = presets.findIndex((item) => item.id === preset.id);
    setPresets((current) => current.filter((item) => item.id !== preset.id));
    if (selectedPresetId === preset.id) setSelectedPresetId(null);
    toast.success(`Deleted ${preset.name}`, {
      action: {
        label: 'Undo',
        onClick: () =>
          setPresets((current) => {
            const next = [...current];
            next.splice(Math.max(0, originalIndex), 0, preset);
            return next;
          }),
      },
    });
  };

  const resetPattern = () => {
    const previous = pattern;
    applyPattern(createEmptyPattern(pattern));
    setSelectedPresetId(null);
    toast.success('Cleared the sequencer.', {
      action: { label: 'Undo', onClick: () => applyPattern(previous) },
    });
  };

  const copySequencers = async () => {
    const output = channels
      .map(
        (channel, index) =>
          `S${String(index + 1).padStart(2, '0')} ${binaryToDecimal(channel)} ${channel
            .map((active) => (active ? '1' : '0'))
            .join('')}`,
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(output);
      toast.success('Copied 24 decimal and binary sequencers.');
    } catch {
      toast.error('Clipboard access is unavailable. Export DAT instead.');
    }
  };

  const selectedBits = channels[selectedChannel] ?? [];
  const selectedDecimal = binaryToDecimal(selectedBits);

  return (
    <div className="workbench-page module-page pulse-view">
      <div className="pulse-workbench">
        <aside className="pulse-inspector" aria-label="Pulse controls">
          <section className="pulse-inspector-section">
            <h3>Pattern</h3>
            <label>
              Name
              <input
                name="pattern-name"
                autoComplete="off"
                maxLength={80}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setSelectedPresetId(null);
                }}
              />
            </label>
            <div className="pulse-field-pair">
              <label>
                BPM
                <input
                  type="number"
                  name="pattern-bpm"
                  autoComplete="off"
                  value={bpm}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    if (Number.isFinite(value)) setBpm(value);
                  }}
                />
              </label>
              <label>
                Siren ID
                <input
                  type="number"
                  name="siren-id"
                  autoComplete="off"
                  value={sirenId}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    if (Number.isFinite(value)) setSirenId(Math.round(value));
                  }}
                />
              </label>
            </div>
          </section>

          <section className="pulse-inspector-section">
            <div className="pulse-section-heading">
              <h3>Preview</h3>
              <span>Tick {step + 1}</span>
            </div>
            <button
              type="button"
              className="pulse-play-button primary"
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <label className="pulse-toggle-row" htmlFor="pulse-preview-glow">
              <span>
                <strong>Light bloom</strong>
                <small>Preview only</small>
              </span>
              <Toggle
                id="pulse-preview-glow"
                name="pulsePreviewGlow"
                checked={glow}
                onChange={setGlow}
              />
            </label>
          </section>

          <section className="pulse-inspector-section pulse-channel-tools">
            <div className="pulse-section-heading">
              <h3>Channel {selectedChannel + 1}</h3>
              <span>{selectedDecimal}</span>
            </div>
            <div className="pulse-color-editor">
              <span
                className="pulse-color-sample"
                style={{ '--channel-color': colors[selectedChannel] } as React.CSSProperties}
                aria-hidden="true"
              />
              <label>
                Color
                <input
                  name="channel-color"
                  autoComplete="off"
                  value={colorDraft}
                  maxLength={7}
                  spellCheck={false}
                  onChange={(event) => setColorDraft(event.target.value)}
                  onBlur={() => {
                    if (/^#[0-9a-f]{6}$/i.test(colorDraft)) setSelectedColor(colorDraft);
                    else setColorDraft(colors[selectedChannel] ?? '#ffffff');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
              </label>
            </div>
            <div className="pulse-color-palette" aria-label="Common siren colors">
              {COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Set channel ${selectedChannel + 1} color to ${color}`}
                  aria-pressed={colors[selectedChannel] === color}
                  style={{ '--channel-color': color } as React.CSSProperties}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </div>
            <div className="pulse-channel-actions">
              <button
                type="button"
                onClick={() =>
                  transformSelectedChannel((channel) => channel.map((active) => !active))
                }
              >
                Invert
              </button>
              <button
                type="button"
                onClick={() =>
                  transformSelectedChannel(() =>
                    Array.from({ length: SIREN_STEP_COUNT }, () => false),
                  )
                }
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() =>
                  transformSelectedChannel(() =>
                    Array.from({ length: SIREN_STEP_COUNT }, () => true),
                  )
                }
              >
                Fill
              </button>
              <button
                type="button"
                aria-label="Shift selected channel left"
                onClick={() => shiftSelectedChannel(-1)}
              >
                <ArrowLeft aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Shift selected channel right"
                onClick={() => shiftSelectedChannel(1)}
              >
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
            <code className="pulse-binary-readout">
              {selectedBits.map((active) => (active ? '1' : '0')).join('')}
            </code>
          </section>

          <section className="pulse-inspector-section pulse-presets">
            <div className="pulse-section-heading">
              <h3>Presets</h3>
              <button type="button" onClick={savePreset}>
                <Save aria-hidden="true" /> Save
              </button>
            </div>
            {presets.length === 0 ? (
              <p className="pulse-presets-empty">
                Save this pattern once, then reuse it across a vehicle pack.
              </p>
            ) : (
              <div className="pulse-preset-list">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className={selectedPresetId === preset.id ? 'is-selected' : ''}
                  >
                    <button type="button" onClick={() => loadPreset(preset)}>
                      <span>{preset.name}</span>
                      <small>{preset.pattern.bpm} BPM</small>
                    </button>
                    <button
                      type="button"
                      className="pulse-delete-preset"
                      aria-label={`Delete ${preset.name} preset`}
                      onClick={() => deletePreset(preset)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="pulse-inspector-section pulse-file-actions">
            <label className="file-pick-button">
              <Upload aria-hidden="true" />
              Import pattern
              <input
                type="file"
                name="siren-pattern-file"
                accept=".json,.dat,.xml,.meta"
                onChange={(event) => {
                  void importPattern(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            <button type="button" onClick={resetPattern}>
              <RotateCcw aria-hidden="true" /> Reset
            </button>
          </section>
        </aside>

        <main className="pulse-canvas">
          <section className={`pulse-preview${glow ? ' is-glowing' : ''}`}>
            <div className="pulse-preview-heading">
              <div>
                <strong>Live output</strong>
                <span>Select a light to edit its channel</span>
              </div>
              <span>{playing ? `Playing at ${bpm} BPM` : 'Preview paused'}</span>
            </div>
            <div className="pulse-lightbar" aria-label="24-channel live light preview">
              {CHANNEL_IDS.map((channelId, index) => {
                const channel = channels[index] ?? [];
                return (
                  <button
                    key={channelId}
                    type="button"
                    aria-label={`Select channel ${index + 1}${channel[step] ? ', on' : ', off'}`}
                    aria-pressed={selectedChannel === index}
                    style={{ '--light-color': colors[index] } as React.CSSProperties}
                    className={`${channel[step] ? 'is-on' : ''}${
                      selectedChannel === index ? ' is-selected' : ''
                    }`}
                    onClick={() => setSelectedChannel(index)}
                  />
                );
              })}
            </div>
          </section>

          <section className="pulse-sequencer-panel">
            <div className="pulse-sequencer-toolbar">
              <div>
                <strong>Sequencer</strong>
                <span>Drag to paint. Arrow keys move between cells; Space toggles.</span>
              </div>
              <div className="pulse-export-actions">
                <button type="button" onClick={() => void copySequencers()}>
                  <Clipboard aria-hidden="true" /> Copy values
                </button>
                <button type="button" onClick={() => exportPattern('dat')}>
                  <Download aria-hidden="true" /> DAT
                </button>
                <button type="button" onClick={() => exportPattern('json')}>
                  <Download aria-hidden="true" /> JSON
                </button>
                <button type="button" className="primary" onClick={() => exportPattern('xml')}>
                  <Download aria-hidden="true" /> carcols.meta
                </button>
              </div>
            </div>
            <div
              className="sequencer"
              role="grid"
              aria-label="24 channel, 32 step siren sequencer"
              aria-rowcount={SIREN_CHANNEL_COUNT}
              aria-colcount={SIREN_STEP_COUNT}
            >
              <div className="sequencer-ruler" aria-hidden="true">
                <span>Channel</span>
                {STEP_IDS.map((tickId, index) => (
                  <i key={tickId} className={index === step ? 'is-current' : ''}>
                    {index + 1}
                  </i>
                ))}
              </div>
              {CHANNEL_IDS.map((channelId, row) => {
                const channel = channels[row] ?? [];
                return (
                  <div
                    className={`sequencer-row${selectedChannel === row ? ' is-selected' : ''}`}
                    role="row"
                    key={channelId}
                  >
                    <button
                      type="button"
                      role="rowheader"
                      className="sequencer-channel"
                      aria-label={`Select channel ${row + 1}`}
                      onClick={() => setSelectedChannel(row)}
                    >
                      <i style={{ background: colors[row] }} aria-hidden="true" />S
                      {String(row + 1).padStart(2, '0')}
                    </button>
                    {STEP_IDS.map((tickId, column) => {
                      const active = channel[column] === true;
                      return (
                        <button
                          key={tickId}
                          type="button"
                          role="gridcell"
                          data-pulse-cell={`${row}-${column}`}
                          aria-selected={active}
                          aria-label={`Channel ${row + 1}, tick ${column + 1}, ${active ? 'on' : 'off'}`}
                          className={`${active ? 'is-on' : ''}${column === step ? ' is-current' : ''}`}
                          style={{ '--step-color': colors[row] } as React.CSSProperties}
                          onFocus={() => setSelectedChannel(row)}
                          onKeyDown={(event) => moveCellFocus(event, row, column)}
                          onClick={(event) => {
                            if (event.detail === 0) setCell(row, column, !active);
                          }}
                          onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            const nextValue = !active;
                            setSelectedChannel(row);
                            paintValue.current = nextValue;
                            setCell(row, column, nextValue);
                          }}
                          onPointerEnter={(event) => {
                            if (paintValue.current !== null && event.buttons === 1) {
                              setSelectedChannel(row);
                              setCell(row, column, paintValue.current);
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
