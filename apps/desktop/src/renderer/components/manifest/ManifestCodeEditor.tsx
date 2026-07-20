import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  StreamLanguage,
  foldGutter,
  foldKeymap,
} from '@codemirror/language';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { search, searchKeymap } from '@codemirror/search';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  drawSelection,
  highlightSpecialChars,
  placeholder,
} from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';
import type { ManifestProblem } from './manifest-utils';

const manifestTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'var(--cortex-editor-canvas)',
      color: 'var(--cortex-text)',
      fontSize: 'var(--editor-font-size)',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono)',
      lineHeight: '1.55',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--cortex-surface-1)',
      color: 'var(--cortex-text-muted)',
      borderRight: '1px solid var(--cortex-border-soft)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgb(167 192 128 / 6%)',
    },
    '.cm-activeLineGutter': {
      color: 'var(--cortex-accent)',
      backgroundColor: 'rgb(167 192 128 / 8%)',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgb(167 192 128 / 18%) !important',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--cortex-accent)',
    },
    '.cm-foldGutter span': {
      color: 'var(--cortex-text-muted)',
    },
    '.cm-lintRange-error': {
      backgroundImage: 'none',
      textDecoration: 'underline wavy var(--cortex-red)',
    },
    '.cm-lintRange-warning': {
      backgroundImage: 'none',
      textDecoration: 'underline wavy var(--cortex-yellow)',
    },
    '.cm-lintRange-info': {
      backgroundImage: 'none',
      textDecoration: 'underline dotted var(--cortex-blue)',
    },
    '.cm-lint-marker-error': {
      color: 'var(--cortex-red)',
    },
    '.cm-lint-marker-warning': {
      color: 'var(--cortex-yellow)',
    },
    '.cm-panels': {
      backgroundColor: 'var(--cortex-surface-2)',
      color: 'var(--cortex-text)',
      borderTop: '1px solid var(--cortex-border-soft)',
    },
    '.cm-panel.cm-search': {
      padding: '6px 8px',
    },
    '.cm-textfield, .cm-button': {
      background: 'var(--cortex-surface-1)',
      color: 'var(--cortex-text)',
      border: '1px solid var(--cortex-border-control)',
      borderRadius: '4px',
    },
    '.cm-button': {
      color: 'var(--cortex-accent)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--cortex-surface-2)',
      border: '1px solid var(--cortex-border-control)',
      color: 'var(--cortex-text)',
    },
    '.cm-tooltip-lint': {
      maxWidth: '48ch',
    },
    '&.cm-focused': {
      outline: 'none',
    },
  },
  { dark: true },
);

function problemSeverityToLint(severity: ManifestProblem['severity']): Diagnostic['severity'] {
  if (severity === 'error') return 'error';
  if (severity === 'warning') return 'warning';
  return 'info';
}

function buildLintExtension(problems: ManifestProblem[]): Extension {
  return linter((view) =>
    problems
      .filter((problem) => problem.line !== null)
      .map((problem) => {
        const line = problem.line ?? 1;
        const lineInfo = view.state.doc.line(Math.min(line, view.state.doc.lines));
        return {
          from: lineInfo.from,
          to: lineInfo.to,
          severity: problemSeverityToLint(problem.severity),
          message: `${problem.title}: ${problem.explanation}`,
        } satisfies Diagnostic;
      }),
  );
}

const quotedPathRegex = /(['"])([^'"]+)\1/g;

export interface ManifestCodeEditorProps {
  value: string;
  readOnly?: boolean;
  problems: ManifestProblem[];
  highlightLine: number | null;
  onChange: (value: string) => void;
  onPathClick?: (line: number) => void;
}

export function ManifestCodeEditor({
  value,
  readOnly = false,
  problems,
  highlightLine,
  onChange,
  onPathClick,
}: ManifestCodeEditorProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const readOnlyCompartment = useRef(new Compartment());
  const lintCompartment = useRef(new Compartment());

  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) onChangeRef.current(update.state.doc.toString());
    });

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          highlightSpecialChars(),
          drawSelection(),
          foldGutter(),
          history(),
          search({ top: true }),
          StreamLanguage.define(lua),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          manifestTheme,
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...searchKeymap,
            indentWithTab,
          ]),
          readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
          lintCompartment.current.of([lintGutter(), buildLintExtension(problems)]),
          updateListener,
          EditorView.domEventHandlers({
            click(event, view) {
              const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
              if (pos === null) return false;
              const line = view.state.doc.lineAt(pos);
              const text = line.text;
              if (!/['"]/.test(text)) return false;
              const matches = [...text.matchAll(quotedPathRegex)];
              for (const match of matches) {
                const start = line.from + (match.index ?? 0);
                const end = start + match[0].length;
                if (pos >= start && pos <= end) {
                  const pathValue = match[2];
                  if (pathValue && /[./\\]/.test(pathValue)) {
                    onPathClick?.(line.number);
                    return true;
                  }
                }
              }
              return false;
            },
          }),
          placeholder('fx_version ...'),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: lintCompartment.current.reconfigure([lintGutter(), buildLintExtension(problems)]),
    });
  }, [problems]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !highlightLine) return;
    const line = Math.min(highlightLine, view.state.doc.lines);
    const lineInfo = view.state.doc.line(line);
    view.dispatch({
      selection: { anchor: lineInfo.from },
      effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
    });
    view.focus();
  }, [highlightLine]);

  return (
    <div
      className="manifest-cm-editor"
      ref={hostRef}
      role="textbox"
      aria-label="Manifest Lua source"
      aria-multiline="true"
    />
  );
}
