import { useRef } from 'react';

interface CodeEditorProps {
  value: string;
  label: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}

export function CodeEditor({
  value,
  label,
  readOnly = false,
  onChange,
}: CodeEditorProps): React.JSX.Element {
  const editor = useRef<HTMLTextAreaElement>(null);

  const insertIndent = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly || event.key !== 'Tab' || event.shiftKey) return;
    event.preventDefault();
    const target = event.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const next = `${value.slice(0, start)}    ${value.slice(end)}`;
    onChange?.(next);
    requestAnimationFrame(() => {
      editor.current?.setSelectionRange(start + 4, start + 4);
    });
  };

  return (
    <textarea
      ref={editor}
      className="monaco-editor code-editor"
      aria-label={label}
      value={value}
      readOnly={readOnly}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      wrap="off"
      onKeyDown={insertIndent}
      onChange={(event) => onChange?.(event.target.value)}
    />
  );
}
