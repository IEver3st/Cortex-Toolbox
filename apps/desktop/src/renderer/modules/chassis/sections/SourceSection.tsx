import { Download, FolderOpen } from 'lucide-react';
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
  onOpenFile,
  onToggleCompare,
}: {
  files: MetaFileInput[];
  savedFiles: MetaFileInput[];
  activeFile: string;
  compareMode: boolean;
  onActiveFileChange: (name: string) => void;
  onFileContentChange: (name: string, content: string) => void;
  onOpenFile: () => void;
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
          <button type="button" onClick={onOpenFile}>
            <FolderOpen aria-hidden="true" />
            Open file
          </button>
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
