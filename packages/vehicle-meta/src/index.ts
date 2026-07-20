import { z } from 'zod';
import type { MetaFileInput } from './diagnose';
import {
  buildHandlingXml,
  HANDLING_PRESETS,
  type HandlingSetup,
  type HandlingValues,
} from './handling';

export * from './handling';
export * from './diagnose';
export * from './schema';
export {
  SCHEMA_PACK_VERSION,
  ANALYZER_VERSION,
  ENUM_REGISTRIES,
  FIELD_CONSTRAINTS,
  RELATIONAL_CONSTRAINTS,
} from './schema-pack';
export {
  validateFiniteFloat,
  validateInteger,
  validateUnsignedInteger,
  validateBoolean,
  validateHex,
  validateNonEmptyString,
  validateSpaceSeparatedArray,
  enumNearMatch,
  tokenAwareDistance,
} from './type-validators';
export type {
  AnalysisPipelineResult,
  FileInventoryRecord,
  MetaSymbol,
  ReferenceOutcome,
  ScanCoverage,
  VehicleGraphNode,
} from './pipeline-types';
export { affinityNearMatch, formatCoverageReport, runAnalysisPipeline } from './analysis';
export {
  analyzeWithCache,
  createAnalysisCache,
  reanalyzeChangedFiles,
  isCacheHit,
  contentHash,
  type AnalysisCache,
} from './incremental';

export const metaFileKindSchema = z.enum([
  'vehicles',
  'handling',
  'carcols',
  'carvariations',
  'vehiclelayouts',
  'modkits',
  'unknown',
]);

export interface VehicleMetaConfig {
  modelName: string;
  displayName?: string;
  makeName?: string;
  handlingId?: string;
  audioNameHash?: string;
  layout?: string;
  vehicleClass?: string;
  mass?: number;
  driveForce?: number;
  gears?: number;
  emergency?: boolean;
  sirenId?: number;
  lightId?: number;
  modkitId?: number;
  handling?: HandlingValues;
  handlingSetup?: HandlingSetup;
  sirenPattern?: SirenPattern;
}

export interface SirenPattern {
  name: string;
  bpm: number;
  sirenId?: number;
  colors: string[];
  channels: boolean[][];
}

export const SIREN_CHANNEL_COUNT = 24;
export const SIREN_STEP_COUNT = 32;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function valuesFor(source: string, tag: string): number[] {
  return [...source.matchAll(new RegExp(`<${tag}\\s+value=["'](\\d+)["']\\s*/?>`, 'gi'))]
    .map((match) => Number.parseInt(match[1] ?? '', 10))
    .filter(Number.isFinite);
}

function textValuesFor(source: string, tag: string): string[] {
  return [...source.matchAll(new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`, 'gi'))]
    .map((match) => match[1]?.trim() ?? '')
    .filter(Boolean);
}

function section(source: string, tag: string): string {
  return new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(source)?.[1] ?? '';
}

function vehicleLightCone(
  tag: string,
  values: {
    intensity: number;
    falloffMax: number;
    falloffExponent: number;
    innerConeAngle: number;
    outerConeAngle: number;
    color: string;
    textureName?: string;
    mirrorTexture: boolean;
  },
): string {
  return `          <${tag}>
            <intensity value="${values.intensity.toFixed(6)}" />
            <falloffMax value="${values.falloffMax.toFixed(6)}" />
            <falloffExponent value="${values.falloffExponent.toFixed(6)}" />
            <innerConeAngle value="${values.innerConeAngle.toFixed(6)}" />
            <outerConeAngle value="${values.outerConeAngle.toFixed(6)}" />
            <emmissiveBoost value="false" />
            <color value="${values.color}" />
            ${values.textureName ? `<textureName>${values.textureName}</textureName>` : '<textureName />'}
            <mirrorTexture value="${values.mirrorTexture}" />
          </${tag}>`;
}

function vehicleLightCorona(
  tag: string,
  values: {
    size: number;
    sizeFar: number;
    intensity: number;
    intensityFar: number;
    color: string;
    numCoronas?: number;
    distance?: number;
    distanceFar?: number;
  },
): string {
  return `          <${tag}>
            <size value="${values.size.toFixed(6)}" />
            <size_far value="${values.sizeFar.toFixed(6)}" />
            <intensity value="${values.intensity.toFixed(6)}" />
            <intensity_far value="${values.intensityFar.toFixed(6)}" />
            <color value="${values.color}" />
            <numCoronas value="${values.numCoronas ?? 1}" />
            <distBetweenCoronas value="${values.distance ?? 128}" />
            <distBetweenCoronas_far value="${values.distanceFar ?? 255}" />
            <xRotation value="0.000000" />
            <yRotation value="0.000000" />
            <zRotation value="0.000000" />
            <zBias value="0.250000" />
            <pullCoronaIn value="false" />
          </${tag}>`;
}

/** A complete, conservative vehicleLightSettings entry following the carcols vehicleLightSettings schema. */
export function buildVehicleLightSettings(lightId: number, name: string): string {
  const indicator = vehicleLightCone('indicator', {
    intensity: 0.375,
    falloffMax: 2.5,
    falloffExponent: 8,
    innerConeAngle: 20,
    outerConeAngle: 50,
    color: '0xFFFF7300',
    mirrorTexture: true,
  });
  const tail = vehicleLightCone('tailLight', {
    intensity: 0.35,
    falloffMax: 4,
    falloffExponent: 16,
    innerConeAngle: 45,
    outerConeAngle: 90,
    color: '0xFFFF0000',
    mirrorTexture: true,
  });
  const head = vehicleLightCone('headLight', {
    intensity: 1,
    falloffMax: 35,
    falloffExponent: 16,
    innerConeAngle: 0,
    outerConeAngle: 60,
    color: '0xFFFFFFCC',
    textureName: 'VehicleLight_car_LED1',
    mirrorTexture: false,
  });
  const reversing = vehicleLightCone('reversingLight', {
    intensity: 0.5,
    falloffMax: 4,
    falloffExponent: 32,
    innerConeAngle: 45,
    outerConeAngle: 90,
    color: '0xFFFFFFFF',
    mirrorTexture: true,
  });
  return `  <Lights>
    <Item>
      <id value="${Math.min(255, Math.max(1, Math.trunc(lightId)))}" />
${indicator}
${vehicleLightCorona('rearIndicatorCorona', { size: 0.25, sizeFar: 2.5, intensity: 1.5, intensityFar: 1, color: '0xFFFF7300' })}
${vehicleLightCorona('frontIndicatorCorona', { size: 0.25, sizeFar: 2.5, intensity: 1.5, intensityFar: 1, color: '0xFFFF7300' })}
${tail}
${vehicleLightCorona('tailLightCorona', { size: 0.35, sizeFar: 4, intensity: 2, intensityFar: 2.5, color: '0xFFFF1803', numCoronas: 2, distance: 1, distanceFar: 128 })}
${vehicleLightCorona('tailLightMiddleCorona', { size: 0, sizeFar: 0, intensity: 0, intensityFar: 0, color: '0x00000000' })}
${head}
${vehicleLightCorona('headLightCorona', { size: 0.3, sizeFar: 5, intensity: 4, intensityFar: 4, color: '0xFFFFFFCC', numCoronas: 2, distance: 1, distanceFar: 160 })}
${reversing}
${vehicleLightCorona('reversingLightCorona', { size: 0.25, sizeFar: 2, intensity: 1.5, intensityFar: 1, color: '0x00F7F7F7' })}
      <name>${escapeXml(name)}</name>
    </Item>
  </Lights>`;
}

export function generateVehicleMetaBundle(config: VehicleMetaConfig): MetaFileInput[] {
  const model = config.modelName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  if (!model) throw new Error('A model name is required.');
  const handling = (config.handlingId ?? model)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');
  const gameName = (config.displayName ?? model)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');
  const make = (config.makeName ?? 'CUSTOM')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');
  const sirenId = Math.min(65_534, Math.max(1, config.sirenId ?? 254));
  const lightId = Math.min(255, Math.max(1, config.lightId ?? 255));
  const modkitId = Math.min(1_023, Math.max(1, config.modkitId ?? 1_000));
  const emergency = config.emergency === true;
  const defaultEmergencyPattern: SirenPattern = {
    name: `${model}_siren`,
    bpm: 600,
    sirenId,
    colors: ['#ff3344', '#2788e8'],
    channels: [decimalToBinary(2_863_311_530), decimalToBinary(1_431_655_765)],
  };
  const sirenXml = emergency
    ? serializeSirenPattern({ ...(config.sirenPattern ?? defaultEmergencyPattern), sirenId }, 'xml')
    : undefined;
  const carcols = sirenXml
    ? sirenXml.replace('  <Lights />', buildVehicleLightSettings(lightId, `${model}_lights`))
    : `<?xml version="1.0" encoding="UTF-8"?>\n<CVehicleModelInfoVarGlobal>\n  <Kits />\n  <Lights />\n  <Sirens />\n</CVehicleModelInfoVarGlobal>\n`;
  const files: MetaFileInput[] = [
    {
      name: 'data/vehicles.meta',
      content: `<?xml version="1.0" encoding="UTF-8"?>\n<CVehicleModelInfo__InitDataList>\n  <residentTxd>vehshare</residentTxd>\n  <residentAnims />\n  <InitDatas>\n    <Item>\n      <modelName>${escapeXml(model)}</modelName>\n      <txdName>${escapeXml(model)}</txdName>\n      <handlingId>${escapeXml(handling)}</handlingId>\n      <gameName>${escapeXml(gameName)}</gameName>\n      <vehicleMakeName>${escapeXml(make)}</vehicleMakeName>\n      <audioNameHash>${escapeXml(config.audioNameHash ?? 'ADDER')}</audioNameHash>\n      <layout>${escapeXml(config.layout ?? 'LAYOUT_STANDARD')}</layout>\n      <type>VEHICLE_TYPE_CAR</type>\n      <vehicleClass>${escapeXml(config.vehicleClass ?? (emergency ? 'VC_EMERGENCY' : 'VC_SPORT'))}</vehicleClass>\n      <wheelType>VWT_SPORT</wheelType>\n      <plateType>VPT_FRONT_AND_BACK_PLATES</plateType>\n      <dashboardType>VDT_SPORT</dashboardType>\n      <flags>${emergency ? 'FLAG_LAW_ENFORCEMENT FLAG_EMERGENCY_SERVICE FLAG_HAS_LIVERY' : 'FLAG_HAS_LIVERY'}</flags>\n      <lodDistances content="float_array">15.000000 30.000000 60.000000 120.000000 500.000000</lodDistances>\n    </Item>\n  </InitDatas>\n</CVehicleModelInfo__InitDataList>\n`,
    },
    {
      name: 'data/handling.meta',
      content: buildHandlingXml(
        escapeXml(handling),
        config.handling ?? {
          ...HANDLING_PRESETS.street.values,
          fMass: config.mass ?? HANDLING_PRESETS.street.values.fMass,
          nInitialDriveGears: config.gears ?? HANDLING_PRESETS.street.values.nInitialDriveGears,
          fInitialDriveForce:
            config.driveForce ?? HANDLING_PRESETS.street.values.fInitialDriveForce,
        },
        config.handlingSetup,
      ),
    },
    {
      name: 'data/carvariations.meta',
      content: `<?xml version="1.0" encoding="UTF-8"?>\n<CVehicleModelInfoVariation>\n  <variationData>\n    <Item>\n      <modelName>${escapeXml(model)}</modelName>\n      <colors />\n      <kits><Item>${modkitId}_${escapeXml(model)}_modkit</Item></kits>\n      <windowsWithExposedEdges />\n      <plateProbabilities />\n      <lightSettings value="${emergency ? lightId : 0}" />\n      <sirenSettings value="${emergency ? sirenId : 0}" />\n    </Item>\n  </variationData>\n</CVehicleModelInfoVariation>\n`,
    },
    {
      name: 'data/carcols.meta',
      content: carcols,
    },
    {
      name: 'data/modkits.meta',
      content: `<?xml version="1.0" encoding="UTF-8"?>\n<CVehicleModelInfoVarGlobal>\n  <Kits>\n    <Item>\n      <kitName>${modkitId}_${escapeXml(model)}_modkit</kitName>\n      <id value="${modkitId}" />\n      <kitType>MKT_STANDARD</kitType>\n      <visibleMods />\n      <linkMods />\n      <statMods />\n      <slotNames />\n      <liveryNames />\n      <livery2Names />\n    </Item>\n  </Kits>\n</CVehicleModelInfoVarGlobal>\n`,
    },
    {
      name: 'data/vehiclelayouts.meta',
      content: `<?xml version="1.0" encoding="UTF-8"?>\n<CVehicleMetadataMgr>\n  <VehicleCoverBoundOffsetInfos />\n  <FirstPersonDriveByLookAroundData />\n</CVehicleMetadataMgr>\n`,
    },
  ];
  return files;
}

export function binaryToDecimal(bits: readonly boolean[]): number {
  const normalized = Array.from({ length: 32 }, (_, index) => bits[index] === true);
  return Number.parseInt(normalized.map((bit) => (bit ? '1' : '0')).join(''), 2) >>> 0;
}

export function decimalToBinary(value: number): boolean[] {
  const safe = Math.max(0, Math.min(0xffff_ffff, Math.trunc(value))) >>> 0;
  return safe
    .toString(2)
    .padStart(32, '0')
    .split('')
    .map((bit) => bit === '1');
}

const BASE_SIREN_COLORS = [
  '#ff4050',
  '#2788e8',
  '#ffffff',
  '#ffb936',
  '#25df82',
  '#9b6cff',
  '#52d6dc',
  '#ff72bd',
];

const DEFAULT_SIREN_COLORS = Array.from(
  { length: SIREN_CHANNEL_COUNT },
  (_, index) => BASE_SIREN_COLORS[index % BASE_SIREN_COLORS.length] ?? '#ffffff',
);

function normalizedChannels(values: readonly unknown[]): boolean[][] {
  return Array.from({ length: SIREN_CHANNEL_COUNT }, (_, row) => {
    const entry = values[row];
    if (typeof entry === 'number') return decimalToBinary(entry);
    if (Array.isArray(entry))
      return Array.from({ length: 32 }, (_, index) => entry[index] === true);
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      if (typeof record.decimal === 'number') return decimalToBinary(record.decimal);
      if (Array.isArray(record.bits)) {
        const bits = record.bits;
        return Array.from({ length: 32 }, (_, index) => bits[index] === true);
      }
    }
    return decimalToBinary(0);
  });
}

function gameColorToHex(value: string | undefined): string {
  const normalized = value?.trim().replace(/^0x/i, '') ?? '';
  if (/^[0-9a-f]{8}$/i.test(normalized)) return `#${normalized.slice(2).toLowerCase()}`;
  if (/^[0-9a-f]{6}$/i.test(normalized)) return `#${normalized.toLowerCase()}`;
  return '#ffffff';
}

/** Import Pulse JSON/DAT or a carcols.meta siren definition without executing input. */
export function parseSirenPattern(source: string): SirenPattern {
  const trimmed = source.trim();
  if (!trimmed) throw new Error('The siren pattern file is empty.');
  if (trimmed.startsWith('{')) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') throw new Error('Pattern JSON must be an object.');
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.channels)) throw new Error('Pattern JSON has no channels.');
    const importedColors = Array.isArray(record.colors) ? record.colors : null;
    return {
      name: typeof record.name === 'string' ? record.name : 'Imported pattern',
      bpm: typeof record.bpm === 'number' ? record.bpm : 600,
      sirenId: typeof record.sirenId === 'number' ? record.sirenId : 254,
      colors: importedColors
        ? Array.from({ length: SIREN_CHANNEL_COUNT }, (_, index) =>
            typeof importedColors[index] === 'string'
              ? importedColors[index]
              : (DEFAULT_SIREN_COLORS[index] ?? '#ffffff'),
          )
        : DEFAULT_SIREN_COLORS,
      channels: normalizedChannels(record.channels),
    };
  }
  if (/^channel\.\d+=/m.test(trimmed)) {
    const entries = new Map(
      trimmed
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith('#') && line.includes('='))
        .map((line) => {
          const divider = line.indexOf('=');
          return [line.slice(0, divider).trim(), line.slice(divider + 1).trim()] as const;
        }),
    );
    return {
      name: entries.get('name') ?? 'Imported pattern',
      bpm: Number.parseInt(entries.get('bpm') ?? '600', 10),
      sirenId: Number.parseInt(entries.get('sirenId') ?? '254', 10),
      colors: DEFAULT_SIREN_COLORS,
      channels: normalizedChannels(
        Array.from({ length: SIREN_CHANNEL_COUNT }, (_, index) =>
          Number.parseInt(entries.get(`channel.${index + 1}`) ?? '0', 10),
        ),
      ),
    };
  }
  if (!/<CVehicleModelInfoVarGlobal\b/i.test(trimmed)) {
    throw new Error('Use a Pulse JSON/DAT file or a carcols.meta XML file.');
  }
  const sirensOpen = /<Sirens(?:\s[^>]*)?>/i.exec(trimmed);
  const sirensClose = trimmed.toLowerCase().lastIndexOf('</sirens>');
  const sirensBody =
    sirensOpen && sirensClose > sirensOpen.index
      ? trimmed.slice(sirensOpen.index + sirensOpen[0].length, sirensClose)
      : '';
  const sirenItem = /<Item(?:\s[^>]*)?>([\s\S]*)<\/Item>/i.exec(sirensBody)?.[1] ?? '';
  const channelsBody = section(sirenItem, 'sirens');
  const items = [...channelsBody.matchAll(/<Item(?:\s[^>]*)?>([\s\S]*?)<\/Item>/gi)].map(
    (match) => match[1] ?? '',
  );
  if (items.length === 0) throw new Error('The carcols file has no importable siren channels.');
  const importedName = textValuesFor(sirenItem, 'name')[0] ?? 'Imported carcols pattern';
  const importedBpm = valuesFor(sirenItem, 'sequencerBpm')[0] ?? 600;
  const importedId = valuesFor(sirenItem, 'id')[0] ?? 254;
  return {
    name: importedName,
    bpm: importedBpm,
    sirenId: importedId,
    colors: Array.from({ length: SIREN_CHANNEL_COUNT }, (_, index) => {
      const color = /<color\s+value=["']([^"']+)["']/i.exec(items[index] ?? '')?.[1];
      return color ? gameColorToHex(color) : (DEFAULT_SIREN_COLORS[index] ?? '#ffffff');
    }),
    channels: normalizedChannels(
      items.map((item) => valuesFor(section(item, 'flashiness'), 'sequencer')[0] ?? 0),
    ),
  };
}

export function serializeSirenPattern(
  pattern: SirenPattern,
  format: 'xml' | 'dat' | 'json',
): string {
  const channels = pattern.channels.map((channel) => ({
    bits: Array.from({ length: 32 }, (_, index) => channel[index] === true),
    decimal: binaryToDecimal(channel),
  }));
  if (format === 'json') {
    return `${JSON.stringify({ version: 1, ...pattern, channels }, null, 2)}\n`;
  }
  if (format === 'dat') {
    return [
      '# Cortex Pulse pattern v1',
      `name=${pattern.name}`,
      `bpm=${pattern.bpm}`,
      `sirenId=${pattern.sirenId ?? 254}`,
      ...channels.map((channel, index) => `channel.${index + 1}=${channel.decimal}`),
      '',
    ].join('\n');
  }
  const toGameColor = (value: string): string => {
    const normalized = value.trim().replace(/^#/, '');
    return /^[0-9a-f]{6}$/i.test(normalized) ? `0xFF${normalized.toUpperCase()}` : '0xFFFFFFFF';
  };
  const items = channels
    .map((channel, index) => {
      const color = toGameColor(pattern.colors[index] ?? '#ffffff');
      return `        <Item>\n          <rotation>\n            <delta value="0.000000" />\n            <start value="0.000000" />\n            <speed value="0.000000" />\n            <sequencer value="${channel.decimal}" />\n            <multiples value="1" />\n            <direction value="true" />\n            <syncToBpm value="true" />\n          </rotation>\n          <flashiness>\n            <delta value="35.000000" />\n            <start value="0.000000" />\n            <speed value="0.000000" />\n            <sequencer value="${channel.decimal}" />\n            <multiples value="1" />\n            <direction value="true" />\n            <syncToBpm value="true" />\n          </flashiness>\n          <corona><intensity value="80.000000" /><size value="0.550000" /><pull value="0.000000" /><faceCamera value="true" /></corona>\n          <color value="${color}" />\n          <intensity value="45.000000" />\n          <lightGroup value="${index}" />\n          <rotate value="false" />\n          <scale value="false" />\n          <scaleFactor value="1.000000" />\n          <flash value="true" />\n          <light value="true" />\n          <spotLight value="false" />\n          <castShadows value="false" />\n        </Item>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<CVehicleModelInfoVarGlobal>\n  <Kits />\n  <Lights />\n  <Sirens>\n    <Item>\n      <id value="${pattern.sirenId ?? 254}" />\n      <name>${escapeXml(pattern.name)}</name>\n      <sequencerBpm value="${pattern.bpm}" />\n      <sirens>\n${items}\n      </sirens>\n    </Item>\n  </Sirens>\n</CVehicleModelInfoVarGlobal>\n`;
}
