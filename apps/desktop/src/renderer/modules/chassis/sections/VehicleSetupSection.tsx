import { HANDLING_FIELDS } from '@cortex/vehicle-meta';
import type { HandlingSetup } from '@cortex/vehicle-meta';
import type { VehicleIdentity } from '../types';
import { VectorInputs } from '../components/VectorInputs';
import { ParameterField } from '../components/ParameterField';
import type { HandlingValues } from '@cortex/vehicle-meta';
import { useState } from 'react';
import { ParameterWikiDialog } from '../components/ParameterWikiDialog';

export function VehicleSetupSection({
  identity,
  handling,
  savedHandling,
  handlingSetup,
  onIdentityChange,
  onHandlingChange,
  onHandlingReset,
  onSetupChange,
  onSetupVectorChange,
}: {
  identity: VehicleIdentity;
  handling: HandlingValues;
  savedHandling: HandlingValues;
  handlingSetup: HandlingSetup;
  onIdentityChange: (key: keyof VehicleIdentity, value: string) => void;
  onHandlingChange: (key: keyof HandlingValues, value: number) => void;
  onHandlingReset: (key: keyof HandlingValues) => void;
  onSetupChange: (patch: Partial<HandlingSetup>) => void;
  onSetupVectorChange: (
    section: 'centreOfMass' | 'inertiaMultiplier' | 'seatOffset',
    axis: 'x' | 'y' | 'z',
    value: number,
  ) => void;
}): React.JSX.Element {
  const massField = HANDLING_FIELDS.find((field) => field.key === 'fMass');
  const [wikiOpen, setWikiOpen] = useState(false);
  const [wikiArticleId, setWikiArticleId] = useState<string | null>(null);
  const openWiki = (articleId: string) => {
    setWikiArticleId(articleId);
    setWikiOpen(true);
  };

  return (
    <div className="chassis-setup-page">
      <header className="chassis-page-intro">
        <h2>Vehicle setup</h2>
        <p>Identity, mass, inertia, and handling metadata that shape balance and AI behavior.</p>
      </header>

      <section className="chassis-setup-panel">
        <h3>Identity</h3>
        <div className="chassis-form-grid">
          <label>
            Model name
            <input
              value={identity.modelName}
              onChange={(event) => onIdentityChange('modelName', event.target.value)}
            />
          </label>
          <label>
            Handling ID
            <input
              value={identity.handlingId}
              onChange={(event) => onIdentityChange('handlingId', event.target.value)}
            />
          </label>
          <label>
            Display label
            <input
              value={identity.displayName}
              onChange={(event) => onIdentityChange('displayName', event.target.value)}
            />
          </label>
          <label>
            Manufacturer
            <input
              value={identity.makeName}
              onChange={(event) => onIdentityChange('makeName', event.target.value)}
            />
          </label>
          <label>
            Audio name hash
            <input
              value={identity.audioNameHash}
              onChange={(event) => onIdentityChange('audioNameHash', event.target.value)}
            />
          </label>
          <label>
            Layout
            <input
              value={identity.layout}
              onChange={(event) => onIdentityChange('layout', event.target.value)}
            />
          </label>
          <label>
            Vehicle class
            <input
              value={identity.vehicleClass}
              onChange={(event) => onIdentityChange('vehicleClass', event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="chassis-setup-panel">
        <h3>Mass and inertia</h3>
        {massField ? (
          <ParameterField
            field={massField}
            value={handling.fMass}
            original={savedHandling.fMass}
            onChange={(value) => onHandlingChange('fMass', value)}
            onReset={() => onHandlingReset('fMass')}
            onOpenWiki={() => openWiki('fMass')}
          />
        ) : null}
        <VectorInputs
          label="Centre of mass offset"
          value={handlingSetup.centreOfMass}
          min={-2}
          max={2}
          onOpenWiki={() => openWiki('centreOfMass')}
          onChange={(axis, value) => onSetupVectorChange('centreOfMass', axis, value)}
        />
        <VectorInputs
          label="Inertia multiplier"
          value={handlingSetup.inertiaMultiplier}
          min={0.1}
          max={5}
          onOpenWiki={() => openWiki('inertiaMultiplier')}
          onChange={(axis, value) => onSetupVectorChange('inertiaMultiplier', axis, value)}
        />
        <VectorInputs
          label="Seat offset distance"
          value={handlingSetup.seatOffset}
          min={-2}
          max={2}
          onOpenWiki={() => openWiki('seatOffset')}
          onChange={(axis, value) => onSetupVectorChange('seatOffset', axis, value)}
        />
      </section>

      <section className="chassis-setup-panel">
        <h3>Flags and AI</h3>
        <div className="chassis-form-grid">
          <label>
            Monetary value
            <input
              type="number"
              min={0}
              step={1000}
              value={handlingSetup.monetaryValue}
              onChange={(event) =>
                onSetupChange({ monetaryValue: Math.max(0, Number(event.target.value) || 0) })
              }
            />
          </label>
          <label>
            Model flags
            <input
              value={handlingSetup.modelFlags}
              onChange={(event) => onSetupChange({ modelFlags: event.target.value })}
            />
          </label>
          <label>
            Handling flags
            <input
              value={handlingSetup.handlingFlags}
              onChange={(event) => onSetupChange({ handlingFlags: event.target.value })}
            />
          </label>
          <label>
            Damage flags
            <input
              value={handlingSetup.damageFlags}
              onChange={(event) => onSetupChange({ damageFlags: event.target.value })}
            />
          </label>
        </div>
        <fieldset className="chassis-choice-fieldset">
          <legend>AI handling</legend>
          <div>
            {(['AVERAGE', 'SPORTS_CAR', 'TRUCK', 'OFF_ROAD', 'NONE'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={handlingSetup.aiHandling === option ? 'is-selected' : ''}
                aria-pressed={handlingSetup.aiHandling === option}
                onClick={() => onSetupChange({ aiHandling: option })}
              >
                {option.replace('_', ' ')}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="chassis-choice-fieldset">
          <legend>Sub-handling data</legend>
          <div>
            {(['none', 'bike', 'boat', 'trailer'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={handlingSetup.subHandling === option ? 'is-selected' : ''}
                aria-pressed={handlingSetup.subHandling === option}
                onClick={() => onSetupChange({ subHandling: option })}
              >
                {option === 'none' ? 'None' : `${option[0]?.toUpperCase()}${option.slice(1)}`}
              </button>
            ))}
          </div>
        </fieldset>
      </section>
      <ParameterWikiDialog
        open={wikiOpen}
        initialArticleId={wikiArticleId}
        onOpenChange={setWikiOpen}
      />
    </div>
  );
}
