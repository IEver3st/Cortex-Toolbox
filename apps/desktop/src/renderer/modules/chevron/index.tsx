import {
  Download,
  Eye,
  FileUp,
  Flashlight,
  Grid3X3,
  ImageDown,
  Layers3,
  Maximize2,
  RotateCcw,
  Save,
  ScanLine,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, Toggle } from '../../components/UiPrimitives';
import { useReducedMotion } from '../../lib/motion';
import { useWorkbenchDraftStore } from '../../store/workbench';
import {
  DEFAULT_CHEVRON_DRAFT,
  readChevronBuilder,
  writeChevronBuilder,
  type ChevronLayout,
  type ChevronTexture,
  type Finish,
  type SavedChevronPreset,
} from './storage';

type PreviewMode = 'day' | 'headlamp' | 'mask';
type PresetGroup = 'response' | 'road' | 'fleet';

interface ChevronPreset {
  id: string;
  label: string;
  description: string;
  group: PresetGroup;
  primary: string;
  secondary: string;
  angle: number;
  stripe: number;
  layout: ChevronLayout;
  message: string;
  finish: Finish;
  reflectivePrimary: boolean;
  reflectiveSecondary: boolean;
}

const PRESETS: ChevronPreset[] = [
  {
    id: 'fire-apparatus',
    label: 'Fire apparatus',
    description: 'Red / fluorescent yellow V rear',
    group: 'response',
    primary: '#d8493e',
    secondary: '#f7c947',
    angle: 45,
    stripe: 42,
    layout: 'v',
    message: 'STAY BACK 500 FT',
    finish: 'microprismatic',
    reflectivePrimary: true,
    reflectiveSecondary: true,
  },
  {
    id: 'rescue-command',
    label: 'Rescue command',
    description: 'Red / white high-contrast rear',
    group: 'response',
    primary: '#c93e38',
    secondary: '#f4f3ed',
    angle: 45,
    stripe: 36,
    layout: 'v',
    message: 'KEEP BACK',
    finish: 'retroreflective',
    reflectivePrimary: true,
    reflectiveSecondary: true,
  },
  {
    id: 'ambulance-visibility',
    label: 'Ambulance visibility',
    description: 'Orange / white emergency rear',
    group: 'response',
    primary: '#e88922',
    secondary: '#f7f5ef',
    angle: 45,
    stripe: 38,
    layout: 'v',
    message: 'AMBULANCE',
    finish: 'retroreflective',
    reflectivePrimary: true,
    reflectiveSecondary: true,
  },
  {
    id: 'law-enforcement',
    label: 'Law enforcement',
    description: 'Cobalt / silver visibility rear',
    group: 'response',
    primary: '#3264c5',
    secondary: '#dfe4e7',
    angle: 45,
    stripe: 36,
    layout: 'v',
    message: 'MOVE OVER',
    finish: 'retroreflective',
    reflectivePrimary: true,
    reflectiveSecondary: true,
  },
  {
    id: 'chapter-8',
    label: 'Chapter 8 works',
    description: 'Reflective red / fluorescent yellow',
    group: 'road',
    primary: '#cf3e3a',
    secondary: '#d8ec3e',
    angle: 45,
    stripe: 40,
    layout: 'v',
    message: 'HIGHWAY MAINTENANCE',
    finish: 'microprismatic',
    reflectivePrimary: true,
    reflectiveSecondary: false,
  },
  {
    id: 'road-hazard',
    label: 'Road hazard',
    description: 'Black / yellow directional panel',
    group: 'road',
    primary: '#1d2424',
    secondary: '#f2c847',
    angle: 45,
    stripe: 46,
    layout: 'diagonal-right',
    message: 'CAUTION',
    finish: 'retroreflective',
    reflectivePrimary: false,
    reflectiveSecondary: true,
  },
  {
    id: 'recovery-amber',
    label: 'Recovery amber',
    description: 'Amber / charcoal recovery rear',
    group: 'road',
    primary: '#ee9e2d',
    secondary: '#232a2b',
    angle: 45,
    stripe: 44,
    layout: 'diagonal-right',
    message: 'RECOVERY',
    finish: 'retroreflective',
    reflectivePrimary: true,
    reflectiveSecondary: false,
  },
  {
    id: 'utility-lime',
    label: 'Utility lime',
    description: 'Fluorescent lime / white service rear',
    group: 'road',
    primary: '#b7dd39',
    secondary: '#f7f7f1',
    angle: 45,
    stripe: 38,
    layout: 'v',
    message: 'UTILITY SERVICE',
    finish: 'microprismatic',
    reflectivePrimary: true,
    reflectiveSecondary: true,
  },
  {
    id: 'dot-conspicuity',
    label: 'DOT conspicuity',
    description: 'Red / white high-visibility panel',
    group: 'fleet',
    primary: '#c63c38',
    secondary: '#f7f7f2',
    angle: 45,
    stripe: 32,
    layout: 'diagonal-right',
    message: '',
    finish: 'microprismatic',
    reflectivePrimary: true,
    reflectiveSecondary: true,
  },
  {
    id: 'fleet-safety',
    label: 'Fleet safety',
    description: 'White / safety orange service rear',
    group: 'fleet',
    primary: '#f5f4ec',
    secondary: '#ee8e2a',
    angle: 45,
    stripe: 40,
    layout: 'v',
    message: 'FLEET SERVICE',
    finish: 'vinyl',
    reflectivePrimary: false,
    reflectiveSecondary: true,
  },
  {
    id: 'coastal-response',
    label: 'Coastal response',
    description: 'Marine blue / white response rear',
    group: 'fleet',
    primary: '#2364a7',
    secondary: '#eef3f0',
    angle: 45,
    stripe: 36,
    layout: 'v',
    message: 'COASTAL RESPONSE',
    finish: 'retroreflective',
    reflectivePrimary: true,
    reflectiveSecondary: true,
  },
];

interface ChevronOptions {
  width: number;
  height: number;
  primary: string;
  secondary: string;
  stripe: number;
  angle: number;
  layout: ChevronLayout;
  seam: boolean;
  text: string;
  textPosition: 'upper' | 'center' | 'lower';
  finish: Finish;
  preview: PreviewMode;
  reflectivePrimary: boolean;
  reflectiveSecondary: boolean;
  texture: ChevronTexture;
  textureImage: HTMLImageElement | null;
}

function adjustHex(hex: string, multiplier: number): string {
  const parsed = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!parsed) return hex;
  const values = parsed
    .slice(1)
    .map((value) => Math.max(0, Math.min(255, Math.round(parseInt(value, 16) * multiplier))));
  return `#${values.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function drawMicroprism(context: CanvasRenderingContext2D, width: number, height: number): void {
  const cell = Math.max(12, Math.min(28, Math.round(width / 72)));
  const row = cell * 0.86;
  context.save();
  context.strokeStyle = 'rgba(255,255,255,0.18)';
  context.lineWidth = Math.max(0.65, cell / 30);
  context.globalAlpha = 0.42;
  for (let y = -row; y < height + row; y += row) {
    const offset = Math.round(y / row) % 2 === 0 ? 0 : cell / 2;
    for (let x = -cell + offset; x < width + cell; x += cell) {
      context.beginPath();
      context.moveTo(x, y + row / 2);
      context.lineTo(x + cell / 2, y);
      context.lineTo(x + cell, y + row / 2);
      context.lineTo(x + cell / 2, y + row);
      context.closePath();
      context.stroke();
    }
  }
  context.restore();
}

function drawTextureOverlay(context: CanvasRenderingContext2D, options: ChevronOptions): void {
  const { texture, textureImage } = options;
  if (!texture.enabled || !textureImage || options.preview === 'mask') return;
  const sourceWidth = textureImage.naturalWidth || textureImage.width;
  const sourceHeight = textureImage.naturalHeight || textureImage.height;
  if (!sourceWidth || !sourceHeight) return;

  const targetWidth = Math.max(16, (options.width * texture.scale) / 100);
  const factor = targetWidth / sourceWidth;
  const targetHeight = Math.max(16, sourceHeight * factor);
  context.save();
  context.globalAlpha = texture.opacity / 100;
  const pattern = context.createPattern(textureImage, 'repeat');
  if (pattern && 'setTransform' in pattern) {
    pattern.setTransform(new DOMMatrix().scale(factor));
    context.fillStyle = pattern;
    context.fillRect(0, 0, options.width, options.height);
  } else {
    for (let y = 0; y < options.height; y += targetHeight) {
      for (let x = 0; x < options.width; x += targetWidth) {
        context.drawImage(textureImage, x, y, targetWidth, targetHeight);
      }
    }
  }
  context.restore();
}

function renderChevron(
  canvas: HTMLCanvasElement,
  options: ChevronOptions,
  pixelRatio: number,
): void {
  canvas.width = Math.round(options.width * pixelRatio);
  canvas.height = Math.round(options.height * pixelRatio);
  canvas.style.aspectRatio = `${options.width} / ${options.height}`;
  const context = canvas.getContext('2d');
  if (!context) return;

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const isMask = options.preview === 'mask';
  const isHeadlamp = options.preview === 'headlamp';
  const materialBoost =
    options.finish === 'microprismatic' ? 1.5 : options.finish === 'retroreflective' ? 1.2 : 0.48;
  const secondary = isMask
    ? options.reflectiveSecondary
      ? '#ffffff'
      : '#050706'
    : isHeadlamp
      ? options.reflectiveSecondary
        ? adjustHex(options.secondary, materialBoost)
        : adjustHex(options.secondary, 0.12)
      : options.secondary;
  const primary = isMask
    ? options.reflectivePrimary
      ? '#ffffff'
      : '#050706'
    : isHeadlamp
      ? options.reflectivePrimary
        ? adjustHex(options.primary, materialBoost)
        : adjustHex(options.primary, 0.12)
      : options.primary;

  context.fillStyle = isHeadlamp ? '#070a09' : secondary;
  context.fillRect(0, 0, options.width, options.height);
  if (isHeadlamp) {
    context.fillStyle = secondary;
    context.fillRect(0, 0, options.width, options.height);
  }

  const radians = (Math.max(15, Math.min(75, options.angle)) * Math.PI) / 180;
  const run = options.height / Math.tan(radians);
  const direction = options.layout === 'diagonal-left' ? -1 : 1;
  const drawSection = (left: number, right: number, sectionDirection: 1 | -1) => {
    context.save();
    context.beginPath();
    context.rect(left, 0, right - left, options.height);
    context.clip();
    context.lineCap = 'butt';
    context.lineWidth = options.stripe;
    context.strokeStyle = primary;
    const spacing = options.stripe * 2;
    for (
      let offset = -options.height - options.width;
      offset < options.width * 2;
      offset += spacing
    ) {
      context.beginPath();
      const xAtTop = sectionDirection === 1 ? offset : options.width - offset;
      context.moveTo(xAtTop, -options.stripe);
      context.lineTo(xAtTop + sectionDirection * run, options.height + options.stripe);
      context.stroke();
    }
    context.restore();
  };

  if (options.layout === 'v') {
    const middle = options.width / 2;
    drawSection(0, middle, 1);
    drawSection(middle, options.width, -1);
  } else {
    drawSection(0, options.width, direction);
  }

  if (!isMask && options.finish === 'microprismatic')
    drawMicroprism(context, options.width, options.height);

  drawTextureOverlay(context, options);

  if (options.seam) {
    context.save();
    context.strokeStyle = isHeadlamp ? 'rgba(255,255,255,0.55)' : 'rgba(11,18,16,0.72)';
    context.lineWidth = Math.max(1, options.width / 900);
    context.setLineDash([8, 7]);
    context.beginPath();
    context.moveTo(options.width / 2, 0);
    context.lineTo(options.width / 2, options.height);
    context.stroke();
    context.restore();
  }

  if (options.text.trim() && !isMask) {
    const size = Math.max(22, Math.min(options.height * 0.16, options.width * 0.075));
    const vertical =
      options.textPosition === 'upper' ? 0.24 : options.textPosition === 'lower' ? 0.76 : 0.5;
    context.font = `700 ${size}px Bahnschrift, "Segoe UI", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.strokeStyle = 'rgba(0,0,0,0.92)';
    context.lineWidth = Math.max(4, size * 0.12);
    context.strokeText(options.text.toUpperCase(), options.width / 2, options.height * vertical);
    context.fillStyle = isHeadlamp ? '#eef7f0' : '#ffffff';
    context.fillText(options.text.toUpperCase(), options.width / 2, options.height * vertical);
  }
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string, successMessage: string): void {
  canvas.toBlob((blob) => {
    if (!blob) {
      toast.error('Could not render the PNG.');
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
    toast.success(successMessage);
  }, 'image/png');
}

function clampDimension(raw: string): number | null {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(128, Math.min(4096, Math.round(value))) : null;
}

function encodeTextureFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = largestSide > 512 ? 512 / largestSide : 1;
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(sourceUrl);
        reject(new Error('The texture could not be prepared.'));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(sourceUrl);
      resolve(canvas.toDataURL('image/webp', 0.86));
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error('The texture image could not be decoded.'));
    };
    image.src = sourceUrl;
  });
}

const COLOR_SWATCHES = [
  '#d8493e',
  '#ee9e2d',
  '#f7c947',
  '#b7dd39',
  '#3264c5',
  '#f7f5ef',
  '#202626',
];
const MESSAGE_TEMPLATES = ['', 'KEEP BACK', 'STAY BACK 500 FT', 'CAUTION', 'HIGHWAY MAINTENANCE'];
const ARTBOARD_SIZES: readonly (readonly [number, number])[] = [
  [1024, 1024],
  [2048, 1024],
  [2048, 2048],
];

export default function ChevronBuilder(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const textureInputRef = useRef<HTMLInputElement>(null);
  const reducedMotion = useReducedMotion();
  const setChevronDraft = useWorkbenchDraftStore((state) => state.setChevron);
  const stored = useMemo(() => readChevronBuilder(globalThis.localStorage), []);
  const [width, setWidth] = useState(stored.draft.width);
  const [height, setHeight] = useState(stored.draft.height);
  const [primary, setPrimary] = useState(stored.draft.primary);
  const [secondary, setSecondary] = useState(stored.draft.secondary);
  const [stripe, setStripe] = useState(stored.draft.stripe);
  const [angle, setAngle] = useState(stored.draft.angle);
  const [layout, setLayout] = useState<ChevronLayout>(stored.draft.layout);
  const [seam, setSeam] = useState(stored.draft.seam);
  const [text, setText] = useState(stored.draft.text);
  const [textPosition, setTextPosition] = useState<'upper' | 'center' | 'lower'>(
    stored.draft.textPosition,
  );
  const [finish, setFinish] = useState<Finish>(stored.draft.finish);
  const [maskPreview, setMaskPreview] = useState(false);
  const [flashlight, setFlashlight] = useState(false);
  const [spotlightEngaged, setSpotlightEngaged] = useState(false);
  const [spotlight, setSpotlight] = useState({ x: 50, y: 50 });
  const [reflectivePrimary, setReflectivePrimary] = useState(stored.draft.reflectivePrimary);
  const [reflectiveSecondary, setReflectiveSecondary] = useState(stored.draft.reflectiveSecondary);
  const [texture, setTexture] = useState<ChevronTexture>(stored.draft.texture);
  const [textureImage, setTextureImage] = useState<HTMLImageElement | null>(null);
  const [customPresets, setCustomPresets] = useState<SavedChevronPreset[]>(stored.presets);
  const [presetName, setPresetName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('fire-apparatus');
  const [presetFilter, setPresetFilter] = useState<'all' | PresetGroup>('all');
  const [zoom, setZoom] = useState(100);
  const preview: PreviewMode = maskPreview ? 'mask' : flashlight ? 'headlamp' : 'day';
  const lightsOut = flashlight && !maskPreview;
  const showLightsOutOverlay = lightsOut && !reducedMotion;
  const spotlightAiming = showLightsOutOverlay && spotlightEngaged;

  const updateSpotlightFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setSpotlight({
      x: Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)),
    });
  };

  const options = useMemo(
    () => ({
      width,
      height,
      primary,
      secondary,
      stripe,
      angle,
      layout,
      seam,
      text,
      textPosition,
      finish,
      preview,
      reflectivePrimary,
      reflectiveSecondary,
      texture,
      textureImage,
    }),
    [
      angle,
      finish,
      height,
      layout,
      preview,
      primary,
      reflectivePrimary,
      reflectiveSecondary,
      seam,
      secondary,
      stripe,
      text,
      textPosition,
      texture,
      textureImage,
      width,
    ],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'f' && event.key !== 'F') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (maskPreview) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input, textarea, select, [contenteditable="true"]'))
      ) {
        return;
      }
      event.preventDefault();
      setFlashlight((on) => {
        if (on) setSpotlightEngaged(false);
        return !on;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [maskPreview]);

  useEffect(() => {
    if (canvasRef.current)
      renderChevron(canvasRef.current, options, Math.min(2, window.devicePixelRatio || 1));
    setChevronDraft({
      name: text.trim() || 'Untitled chevron',
      width,
      height,
      updatedAt: new Date().toISOString(),
    });
  }, [options, setChevronDraft, text, width, height]);

  useEffect(() => {
    if (!texture.dataUrl) {
      setTextureImage(null);
      return;
    }
    const image = new Image();
    image.onload = () => setTextureImage(image);
    image.onerror = () => {
      setTextureImage(null);
      toast.error('The texture image could not be read.');
    };
    image.src = texture.dataUrl;
  }, [texture.dataUrl]);

  useEffect(() => {
    writeChevronBuilder(globalThis.localStorage, {
      draft: {
        width,
        height,
        primary,
        secondary,
        stripe,
        angle,
        layout,
        seam,
        text,
        textPosition,
        finish,
        reflectivePrimary,
        reflectiveSecondary,
        texture,
      },
      presets: customPresets,
    });
  }, [
    angle,
    customPresets,
    finish,
    height,
    layout,
    primary,
    reflectivePrimary,
    reflectiveSecondary,
    seam,
    secondary,
    stripe,
    text,
    textPosition,
    texture,
    width,
  ]);

  const markCustom = () => setSelectedPreset('');
  const applyDraft = (preset: ChevronPreset | SavedChevronPreset) => {
    setSelectedPreset(preset.id);
    setPrimary(preset.primary);
    setSecondary(preset.secondary);
    setStripe(preset.stripe);
    setAngle(preset.angle);
    setLayout(preset.layout);
    setText('message' in preset ? preset.message : preset.text);
    setFinish(preset.finish);
    setReflectivePrimary(preset.reflectivePrimary);
    setReflectiveSecondary(preset.reflectiveSecondary);
    setTexture('texture' in preset ? preset.texture : DEFAULT_CHEVRON_DRAFT.texture);
  };
  const applyPreset = (preset: ChevronPreset) => applyDraft(preset);
  const renderExport = (mode: PreviewMode) => {
    const exportCanvas = document.createElement('canvas');
    renderChevron(exportCanvas, { ...options, preview: mode, seam: false }, 1);
    return exportCanvas;
  };
  const visiblePresets = PRESETS.filter(
    (preset) => presetFilter === 'all' || preset.group === presetFilter,
  );
  const restoreInitialPreset = () => {
    const initialPreset = PRESETS[0];
    if (initialPreset) applyPreset(initialPreset);
  };
  const savePreset = () => {
    const label = presetName.trim();
    if (!label) {
      toast.error('Name this preset before saving it.');
      return;
    }
    const savedAt = new Date().toISOString();
    const preset: SavedChevronPreset = {
      id: `custom-${crypto.randomUUID()}`,
      label: label.slice(0, 80),
      savedAt,
      width,
      height,
      primary,
      secondary,
      stripe,
      angle,
      layout,
      seam,
      text,
      textPosition,
      finish,
      reflectivePrimary,
      reflectiveSecondary,
      texture,
    };
    setCustomPresets((current) => [preset, ...current].slice(0, 24));
    setSelectedPreset(preset.id);
    setPresetName('');
    toast.success(`${preset.label} saved to your preset library.`);
  };
  const removePreset = (id: string) => {
    setCustomPresets((current) => current.filter((preset) => preset.id !== id));
    if (selectedPreset === id) setSelectedPreset('');
  };
  const importTexture = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose a PNG, JPEG, WebP, or other image texture.');
      return;
    }
    if (file.size > 5_000_000) {
      toast.error('Use a texture smaller than 5 MB. It will be optimized before it is saved.');
      return;
    }
    void encodeTextureFile(file)
      .then((dataUrl) => {
        markCustom();
        setTexture((current) => ({ ...current, enabled: true, dataUrl, fileName: file.name }));
      })
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : 'The texture image could not be imported.',
        ),
      );
  };

  return (
    <div className="workbench-page module-page chevron-view">
      <PageHeader
        actions={
          <div className="chevron-header-actions">
            <button
              type="button"
              onClick={() =>
                downloadCanvas(
                  renderExport('mask'),
                  `chevron-reflectivity-${width}x${height}.png`,
                  'Reflectivity mask exported.',
                )
              }
            >
              <ImageDown aria-hidden="true" /> Export mask
            </button>
            <button
              type="button"
              className="primary"
              onClick={() =>
                downloadCanvas(
                  renderExport('day'),
                  `chevron-${width}x${height}.png`,
                  'Chevron PNG exported.',
                )
              }
            >
              <Download aria-hidden="true" /> Export PNG
            </button>
          </div>
        }
      />

      <div className="chevron-shell">
        <aside className="chevron-controls" aria-label="Chevron controls">
          <section className="chevron-control-section">
            <div className="chevron-section-title">
              <Grid3X3 aria-hidden="true" />
              <h2>Artboard</h2>
            </div>
            <div className="chevron-size-row">
              <label>
                Width
                <input
                  type="number"
                  name="chevronWidth"
                  autoComplete="off"
                  min={128}
                  max={4096}
                  value={width}
                  onChange={(event) => {
                    markCustom();
                    const next = clampDimension(event.target.value);
                    if (next !== null) setWidth(next);
                  }}
                />
              </label>
              <span aria-hidden="true">×</span>
              <label>
                Height
                <input
                  type="number"
                  name="chevronHeight"
                  autoComplete="off"
                  min={128}
                  max={4096}
                  value={height}
                  onChange={(event) => {
                    markCustom();
                    const next = clampDimension(event.target.value);
                    if (next !== null) setHeight(next);
                  }}
                />
              </label>
            </div>
            <div className="chevron-size-presets" aria-label="Common artboard sizes">
              {ARTBOARD_SIZES.map(([presetWidth, presetHeight]) => (
                <button
                  key={`${presetWidth}x${presetHeight}`}
                  type="button"
                  aria-pressed={width === presetWidth && height === presetHeight}
                  onClick={() => {
                    markCustom();
                    setWidth(presetWidth);
                    setHeight(presetHeight);
                  }}
                >
                  {presetWidth} × {presetHeight}
                </button>
              ))}
            </div>
          </section>

          <section className="chevron-control-section">
            <div className="chevron-section-title">
              <Sparkles aria-hidden="true" />
              <h2>Colors</h2>
            </div>
            {(
              [
                { label: 'Stripe A', value: primary, change: setPrimary },
                { label: 'Stripe B', value: secondary, change: setSecondary },
              ] as const
            ).map((color) => (
              <div className="chevron-color-field" key={color.label}>
                <label htmlFor={`chevron-${color.label}`}>{color.label}</label>
                <div>
                  <input
                    id={`chevron-${color.label}`}
                    name={`chevron${color.label.replace(' ', '')}`}
                    value={color.value.toUpperCase()}
                    autoComplete="off"
                    maxLength={7}
                    spellCheck={false}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (/^#[\dA-F]{0,6}$/i.test(next)) {
                        markCustom();
                        color.change(next);
                      }
                    }}
                  />
                  <span style={{ backgroundColor: color.value }} aria-hidden="true" />
                </div>
              </div>
            ))}
            <div className="chevron-swatch-row" aria-label="Quick colors">
              {COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Use ${color} for stripe A`}
                  style={{ '--swatch': color } as React.CSSProperties}
                  onClick={() => {
                    markCustom();
                    setPrimary(color);
                  }}
                />
              ))}
            </div>
          </section>

          <section className="chevron-control-section">
            <div className="chevron-section-title">
              <ScanLine aria-hidden="true" />
              <h2>Pattern</h2>
            </div>
            <div className="chevron-layout-picker" role="group" aria-label="Chevron layout">
              {(
                [
                  { id: 'v', label: 'Centered V' },
                  { id: 'diagonal-right', label: 'Right diagonal' },
                  { id: 'diagonal-left', label: 'Left diagonal' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={layout === item.id}
                  onClick={() => {
                    markCustom();
                    setLayout(item.id);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label>
              Stripe width <output>{stripe}px</output>
              <input
                type="range"
                name="chevronStripeWidth"
                min={8}
                max={160}
                value={stripe}
                onChange={(event) => {
                  markCustom();
                  setStripe(Number(event.target.value));
                }}
              />
            </label>
            <label>
              Stripe angle <output>{angle}°</output>
              <input
                type="range"
                name="chevronStripeAngle"
                min={15}
                max={75}
                value={angle}
                onChange={(event) => {
                  markCustom();
                  setAngle(Number(event.target.value));
                }}
              />
            </label>
            <div className="chevron-toggle-row">
              <span>
                <strong>UV center guide</strong>
                <small>Visible in the editor only.</small>
              </span>
              <Toggle
                id="chevron-seam"
                name="chevronSeam"
                checked={seam}
                onChange={(value) => {
                  markCustom();
                  setSeam(value);
                }}
              />
            </div>
          </section>

          <section className="chevron-control-section chevron-texture-section">
            <div className="chevron-section-title">
              <Layers3 aria-hidden="true" />
              <h2>Texture overlay</h2>
            </div>
            <div className="chevron-toggle-row">
              <span>
                <strong>Show texture layer</strong>
                <small>Drawn over the chevrons and below your message.</small>
              </span>
              <Toggle
                id="chevron-texture-enabled"
                name="chevronTextureEnabled"
                checked={texture.enabled}
                onChange={(enabled) => {
                  markCustom();
                  setTexture((current) => ({ ...current, enabled }));
                }}
              />
            </div>
            <input
              ref={textureInputRef}
              className="chevron-texture-input"
              type="file"
              aria-label="Import texture image"
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
              tabIndex={-1}
              onChange={(event) => importTexture(event.target.files?.[0])}
            />
            <div className="chevron-texture-source">
              <span>
                <strong>{texture.fileName || 'No texture loaded'}</strong>
                <small>
                  {texture.dataUrl
                    ? 'Saved locally on this device.'
                    : 'Images are reduced to 512 px before they are saved.'}
                </small>
              </span>
              <button type="button" onClick={() => textureInputRef.current?.click()}>
                <FileUp aria-hidden="true" /> {texture.dataUrl ? 'Replace' : 'Import'}
              </button>
            </div>
            {texture.dataUrl ? (
              <button
                type="button"
                className="chevron-clear-texture"
                onClick={() => {
                  markCustom();
                  setTexture((current) => ({
                    ...current,
                    enabled: false,
                    dataUrl: '',
                    fileName: '',
                  }));
                  if (textureInputRef.current) textureInputRef.current.value = '';
                }}
              >
                Remove texture
              </button>
            ) : null}
            <label>
              Texture opacity <output>{texture.opacity}%</output>
              <input
                type="range"
                name="chevronTextureOpacity"
                min={0}
                max={100}
                disabled={!texture.dataUrl}
                value={texture.opacity}
                onChange={(event) => {
                  markCustom();
                  setTexture((current) => ({ ...current, opacity: Number(event.target.value) }));
                }}
              />
            </label>
            <label>
              Texture scale <output>{texture.scale}%</output>
              <input
                type="range"
                name="chevronTextureScale"
                min={20}
                max={240}
                disabled={!texture.dataUrl}
                value={texture.scale}
                onChange={(event) => {
                  markCustom();
                  setTexture((current) => ({ ...current, scale: Number(event.target.value) }));
                }}
              />
            </label>
          </section>

          <section className="chevron-control-section">
            <div className="chevron-section-title">
              <Eye aria-hidden="true" />
              <h2>Message</h2>
            </div>
            <div className="chevron-message-templates" aria-label="Message templates">
              {MESSAGE_TEMPLATES.map((template) => (
                <button
                  key={template || 'none'}
                  type="button"
                  aria-pressed={text === template}
                  onClick={() => {
                    markCustom();
                    setText(template);
                  }}
                >
                  {template || 'No message'}
                </button>
              ))}
            </div>
            <label>
              Custom message
              <input
                value={text}
                placeholder="Optional rear-panel message"
                maxLength={42}
                name="chevronMessage"
                autoComplete="off"
                onChange={(event) => {
                  markCustom();
                  setText(event.target.value);
                }}
              />
            </label>
            <div className="chevron-text-position" role="group" aria-label="Message position">
              {(['upper', 'center', 'lower'] as const).map((position) => (
                <button
                  key={position}
                  type="button"
                  aria-pressed={textPosition === position}
                  onClick={() => setTextPosition(position)}
                >
                  {position}
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="chevron-canvas-panel" aria-label="Chevron preview">
          <div className="chevron-canvas-toolbar">
            <div className="chevron-preview-modes" role="group" aria-label="Preview lighting">
              <button
                type="button"
                aria-pressed={flashlight && !maskPreview}
                disabled={maskPreview}
                title="Turn off lights and preview reflective return (F)"
                onClick={() => {
                  setFlashlight((on) => {
                    if (on) setSpotlightEngaged(false);
                    return !on;
                  });
                }}
              >
                <Flashlight aria-hidden="true" /> Flashlight
              </button>
              <button
                type="button"
                aria-pressed={maskPreview}
                onClick={() => {
                  setMaskPreview((value) => {
                    const next = !value;
                    if (next) {
                      setFlashlight(false);
                      setSpotlightEngaged(false);
                    }
                    return next;
                  });
                }}
              >
                <ScanLine aria-hidden="true" /> Mask
              </button>
            </div>
            <div className="chevron-zoom-controls" aria-label="Preview zoom">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => setZoom((value) => Math.max(50, value - 25))}
              >
                −
              </button>
              <output>{zoom}%</output>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => setZoom((value) => Math.min(200, value + 25))}
              >
                +
              </button>
              <button type="button" aria-label="Fit preview" onClick={() => setZoom(100)}>
                <Maximize2 aria-hidden="true" /> Fit
              </button>
            </div>
          </div>
          <div
            ref={stageRef}
            className={`chevron-canvas-stage is-${preview}${spotlightAiming ? ' has-spotlight' : ''}`}
            onPointerMove={(event) => {
              if (!lightsOut || maskPreview || reducedMotion) return;
              setSpotlightEngaged(true);
              updateSpotlightFromPointer(event);
            }}
            onPointerLeave={() => {
              setSpotlightEngaged(false);
              setSpotlight({ x: 50, y: 50 });
            }}
          >
            <div className="chevron-canvas-wrap" style={{ width: `${zoom}%` }}>
              <span className="chevron-artboard-label">
                {width} × {height} px
              </span>
              <canvas ref={canvasRef} aria-label="Chevron pattern preview" />
              <span className="chevron-artboard-corner top-left" aria-hidden="true" />
              <span className="chevron-artboard-corner top-right" aria-hidden="true" />
              <span className="chevron-artboard-corner bottom-left" aria-hidden="true" />
              <span className="chevron-artboard-corner bottom-right" aria-hidden="true" />
            </div>
            {showLightsOutOverlay ? (
              <div
                className={`chevron-spotlight-overlay${spotlightActive ? ' is-engaged' : ''}`}
                style={
                  spotlightActive
                    ? ({
                        '--spotlight-x': `${spotlight.x}%`,
                        '--spotlight-y': `${spotlight.y}%`,
                      } as React.CSSProperties)
                    : undefined
                }
                aria-hidden="true"
              />
            ) : null}
          </div>
          <footer className="chevron-preview-footer">
            <span>
              {preview === 'mask'
                ? 'White areas become the material-guide output. Texture overlays stay out of this mask.'
                : flashlight
                  ? reducedMotion
                    ? 'Flashlight preview shows reflective return across the full pattern.'
                    : spotlightEngaged
                      ? 'Move the flashlight over the pattern to preview reflective return.'
                      : 'Lights off. Move over the preview to aim the flashlight.'
                  : 'Artwork export stays clean: guides and preview lighting are excluded.'}
            </span>
            <span>
              <Grid3X3 aria-hidden="true" /> Exact raster output
            </span>
          </footer>
        </section>

        <aside className="chevron-presets" aria-label="Chevron presets">
          <div className="chevron-presets-header">
            <div>
              <h2>Preset library</h2>
              <p>{visiblePresets.length} ready-to-tune starting points</p>
            </div>
            <button
              type="button"
              aria-label="Restore fire apparatus preset"
              onClick={restoreInitialPreset}
            >
              <RotateCcw aria-hidden="true" />
            </button>
          </div>
          <div className="chevron-save-preset">
            <label>
              Save current as
              <input
                name="chevronPresetName"
                autoComplete="off"
                maxLength={80}
                placeholder="e.g. Station 04 rear"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    savePreset();
                  }
                }}
              />
            </label>
            <button type="button" className="primary" onClick={savePreset}>
              <Save aria-hidden="true" /> Save preset
            </button>
          </div>
          {customPresets.length ? (
            <section className="chevron-custom-presets" aria-label="Your saved presets">
              <div>
                <h3>Your presets</h3>
                <span>{customPresets.length}</span>
              </div>
              <div className="chevron-preset-list">
                {customPresets.map((preset) => (
                  <div className="chevron-custom-preset" key={preset.id}>
                    <button
                      type="button"
                      className={selectedPreset === preset.id ? 'is-selected' : ''}
                      onClick={() => applyDraft(preset)}
                    >
                      <span
                        className="chevron-preset-preview"
                        style={
                          {
                            '--preset-a': preset.primary,
                            '--preset-b': preset.secondary,
                          } as React.CSSProperties
                        }
                      />
                      <span>
                        <strong>{preset.label}</strong>
                        <small>
                          {preset.texture.dataUrl
                            ? `Texture · ${preset.width} × ${preset.height}`
                            : `${preset.width} × ${preset.height}`}
                        </small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete ${preset.label}`}
                      onClick={() => removePreset(preset.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <div className="chevron-preset-filters" role="group" aria-label="Preset categories">
            {(['all', 'response', 'road', 'fleet'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={presetFilter === filter}
                onClick={() => setPresetFilter(filter)}
              >
                {filter === 'all' ? 'All' : filter}
              </button>
            ))}
          </div>
          <div className="chevron-preset-list">
            {visiblePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={selectedPreset === preset.id ? 'is-selected' : ''}
                onClick={() => applyPreset(preset)}
              >
                <span
                  className="chevron-preset-preview"
                  style={
                    {
                      '--preset-a': preset.primary,
                      '--preset-b': preset.secondary,
                      '--preset-layout': preset.layout === 'v' ? 'v' : 'diagonal',
                    } as React.CSSProperties
                  }
                />
                <span>
                  <strong>{preset.label}</strong>
                  <small>{preset.description}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
