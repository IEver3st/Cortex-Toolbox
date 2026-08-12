import type { EditorTab } from '../store/workspace';
import { CodeEditor } from './CodeEditor';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { unwrap } from '../lib/result';

export function FileView({ tab }: { tab: EditorTab }): React.JSX.Element {
  const [value, setValue] = useState(tab.content ?? '');
  const [original, setOriginal] = useState(tab.content ?? '');
  const [plan, setPlan] = useState<{ id: string } | null>(null);
  useEffect(() => {
    setValue(tab.content ?? '');
    setOriginal(tab.content ?? '');
    setPlan(null);
  }, [tab.content, tab.id]);
  const dirty = value !== original;
  const review = async () => {
    if (!tab.relativePath || !dirty) return;
    try {
      setPlan(
        unwrap(
          await window.cortex.files.planWrite({ relativePath: tab.relativePath, source: value }),
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not prepare the change.');
    }
  };
  const apply = async () => {
    if (!plan) return;
    try {
      unwrap(await window.cortex.files.applyWrite({ planId: plan.id }));
      setOriginal(value);
      setPlan(null);
      toast.success('File updated with a recoverable backup.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the file.');
    }
  };
  return (
    <div className="studio">
      <div className="editor-toolbar">
        <div>
          <strong>{tab.readOnly ? 'Inspection view' : 'Source editor'}</strong>
          <span>{tab.relativePath}</span>
        </div>
        {!tab.readOnly && (
          <div className="header-actions">
            <button type="button" disabled={!dirty} onClick={() => void review()}>
              Review changes
            </button>
            {plan && (
              <button type="button" className="primary" onClick={() => void apply()}>
                Apply safely
              </button>
            )}
          </div>
        )}
      </div>
      <div className="file-editor">
        <CodeEditor
          label={`${tab.readOnly ? 'Read-only' : 'Source'} editor for ${tab.relativePath ?? tab.label}`}
          value={value}
          readOnly={tab.readOnly ?? true}
          onChange={setValue}
        />
      </div>
    </div>
  );
}
