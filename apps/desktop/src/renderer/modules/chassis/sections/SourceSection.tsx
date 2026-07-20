import { Download, Upload } from 'lucide-react';
import type { MetaFileInput } from '@cortex/vehicle-meta';
import { CodeEditor } from '../../../components/CodeEditor';
import { downloadText } from '../../shared/download';

export function SourceSection({
  files,
  savedFiles,
  activeFile,
  compareMode,
  onActiveFileChange,
  onFileContentChange,
  onImport,
  onToggleCompare,
}: {
  files: MetaFileInput[];
  savedFiles: MetaFileInput[];
  activeFile: string;
  compareMode: boolean;
  onActiveFileChange: (name: string) => void;
  onFileContentChange: (name: string, content: string) => void;
  onImport: (files: FileList) => void;
  onToggleCompare: () => void;
}): React.JSX.Element {
  const current = files.find((file) => file.name === activeFile) ?? files[0];
  const saved = savedFiles.find((file) => file.name === current?.name);

  return (
    <div className="chassis-source-page">
      <header className="chassis-source-header">
        <h2>Source</h2>
        <div className="chassis-source-actions">
          <button
            type="button"
            className={compareMode ? 'is-active' : ''}
            onClick={onToggleCompare}
          >
            Side-by-side diff
          </button>
          <label className="file-pick-button compact">
            <Upload aria-hidden="true" />
            Import
            <input
              type="file"
              accept=".meta,.xml"
              multiple
              hidden
              onChange={(event) => event.target.files?.length && onImport(event.target.files)}
            />
          </label>
          {current ? (
            <button
              type="button"
              onClick={() =>
                downloadText(
                  current.name.split('/').at(-1) ?? 'vehicle.meta',
                  current.content,
                  'application/xml',
                )
              }
            >
              <Download aria-hidden="true" />
              Export
            </button>
          ) : null}
        </div>
      </header>

      <div className="chassis-tabs" role="tablist" aria-label="Metadata files">
        {files.map((file) => (
          <button
            key={file.name}
            type="button"
            role="tab"
            aria-selected={file.name === current?.name}
            className={file.name === current?.name ? 'is-active' : ''}
            onClick={() => onActiveFileChange(file.name)}
          >
            {file.name.split('/').at(-1)}
          </button>
        ))}
      </div>

      {current ? (
        compareMode ? (
          <div className="chassis-source-diff">
            <CodeEditor value={saved?.content ?? ''} label={`Saved ${current.name}`} readOnly />
            <CodeEditor
              value={current.content}
              label={`Current ${current.name}`}
              onChange={(content) => onFileContentChange(current.name, content)}
            />
          </div>
        ) : (
          <CodeEditor
            value={current.content}
            label={`Edit ${current.name}`}
            onChange={(content) => onFileContentChange(current.name, content)}
          />
        )
      ) : null}
    </div>
  );
}
