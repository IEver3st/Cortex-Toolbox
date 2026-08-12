import { describe, expect, it } from 'vitest';
import { analyzeScript, buildResourceAnalysis, probeFindingFingerprint } from './index';
import { buildProbeFindings } from './probe-findings';

describe('probe findings', () => {
  it('maps loop warnings into structured performance findings', () => {
    const file = analyzeScript(
      'client/hot.lua',
      [
        'CreateThread(function()',
        '  while true do',
        "    TriggerServerEvent('hot:path')",
        '  end',
        'end)',
      ].join('\n'),
    );
    const analysis = buildResourceAnalysis([file]);
    const findings = buildProbeFindings(analysis);
    expect(
      findings.some((finding) => finding.ruleId === 'probe/performance/busy-loop-no-yield'),
    ).toBe(true);
    expect(findings.some((finding) => finding.ruleId === 'probe/performance/network-in-loop')).toBe(
      true,
    );
  });

  it('re-exports probeFindingFingerprint from the package barrel', () => {
    expect(
      probeFindingFingerprint({
        ruleId: 'probe/performance/busy-loop-no-yield',
        file: 'client/hot.lua',
        startLine: 2,
        endLine: 4,
      }),
    ).toBe('probe/performance/busy-loop-no-yield|client/hot.lua|2|4');
  });

  it('flags duplicate event registrations with wire links', () => {
    const file = analyzeScript(
      'server/events.lua',
      [
        "RegisterNetEvent('garage:open')",
        "AddEventHandler('garage:open', function() end)",
        "RegisterNetEvent('garage:open')",
      ].join('\n'),
    );
    const findings = buildProbeFindings(buildResourceAnalysis([file]));
    const duplicate = findings.find(
      (finding) => finding.ruleId === 'probe/event-safety/duplicate-registration',
    );
    expect(duplicate).toBeTruthy();
    expect(duplicate?.wireLink).toMatchObject({ symbolKind: 'event', symbolName: 'garage:open' });
  });
});
