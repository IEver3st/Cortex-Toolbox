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

  it('reports the audited conditional unyielded loop independently of event-safety findings', () => {
    const source = [
      'CreateThread(function()',
      '  while pending do',
      "    TriggerServerEvent('audit:pending')",
      '  end',
      'end)',
    ].join('\n');
    const file = analyzeScript('client/audit-pending.lua', source);
    const findings = buildProbeFindings(buildResourceAnalysis([file]), {
      sources: { 'client/audit-pending.lua': source },
    });
    expect(
      findings.some((finding) => finding.ruleId === 'probe/performance/busy-loop-no-yield'),
    ).toBe(true);
    expect(findings.some((finding) => finding.ruleId === 'probe/performance/network-in-loop')).toBe(
      true,
    );
    expect(findings.filter((finding) => finding.category === 'performance')).toHaveLength(2);
  });

  it('does not report busy loops for a proper yield or an ordinary finite condition', () => {
    const yieldingSource = ['while pending do', '  Citizen.Wait(100)', '  poll()', 'end'].join(
      '\n',
    );
    const finiteSource = [
      'local index = 1',
      'while index <= #items do',
      '  consume(items[index])',
      '  index = index + 1',
      'end',
    ].join('\n');
    const yielding = analyzeScript('client/yielding.lua', yieldingSource);
    const finite = analyzeScript('client/finite.lua', finiteSource);
    const findings = buildProbeFindings(buildResourceAnalysis([yielding, finite]), {
      sources: {
        'client/yielding.lua': yieldingSource,
        'client/finite.lua': finiteSource,
      },
    });
    expect(
      findings.some((finding) => finding.ruleId === 'probe/performance/busy-loop-no-yield'),
    ).toBe(false);
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
