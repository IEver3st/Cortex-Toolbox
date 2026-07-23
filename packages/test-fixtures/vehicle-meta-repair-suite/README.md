# FiveM Vehicle Meta Repair Test Suite

This suite contains eight synthetic FiveM/GTA V vehicle metadata repair cases.

## Layout

- `cases/` — intentionally broken resources, one defect per case.
- `fixed_reference/` — repaired versions for comparison.
- `batch_all_broken/` — all eight broken files registered in one resource.
- `ANSWER_KEY.csv` — exact faulty line and expected repair.
- `validation_report.json` — generator verification results.

## Case coverage

1. `carcols.meta` — missing self-closing slash.
2. `carvariations.meta` — missing closing-tag bracket.
3. `handling.meta` — unclosed XML attribute quote.
4. `vehicles.meta` — mismatched closing tag.
5. `vehiclelayouts.meta` — unescaped ampersand.
6. `handling.meta` — invalid numeric value while XML remains well formed.
7. `vehicles.meta` — handling ID does not match `handling.meta`.
8. `carvariations.meta` — modkit reference does not match `carcols.meta`.

Every case changes exactly one line between the broken and fixed versions.

## Important limitation

These are compact, schema-shaped fixtures designed to test metadata detection,
diagnostics, and one-line repair behavior. They are not a complete spawnable
vehicle pack and do not include model or texture assets.

Cases 1–5 are guaranteed XML parser failures. Cases 6–8 are semantic or
cross-file failures and require validation beyond basic XML parsing.
