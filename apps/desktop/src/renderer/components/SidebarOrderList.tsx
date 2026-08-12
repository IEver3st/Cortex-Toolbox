import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useCallback, useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import { MODULE_BY_ID, type ModuleId } from '../../shared/modules';
import { useModuleStore } from '../store/modules';

function reorderableModules(installed: ModuleId[]): ModuleId[] {
  return installed.filter((id) => MODULE_BY_ID[id].category !== 'system');
}

function isModuleId(value: string): value is ModuleId {
  return Object.hasOwn(MODULE_BY_ID, value);
}

export function SidebarOrderList(): React.JSX.Element {
  const installed = useModuleStore((state) => state.installed);
  const move = useModuleStore((state) => state.move);
  const reorder = useModuleStore((state) => state.reorder);
  const ordered = useMemo(() => reorderableModules(installed), [installed]);
  const [dragId, setDragId] = useState<ModuleId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<ModuleId | null>(null);

  const clearDragState = useCallback(() => {
    setDragId(null);
    setDropTargetId(null);
  }, []);

  const handleDragStart = useCallback((event: DragEvent<HTMLSpanElement>, id: ModuleId) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDragId(id);
    setDropTargetId(id);
  }, []);

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, id: ModuleId) => {
      if (!dragId || dragId === id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTargetId(id);
    },
    [dragId],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, toId: ModuleId) => {
      event.preventDefault();
      const fromId = event.dataTransfer.getData('text/plain');
      const toIndex = ordered.indexOf(toId);
      if (!isModuleId(fromId) || toIndex < 0) {
        clearDragState();
        return;
      }
      void reorder(fromId, toIndex);
      clearDragState();
    },
    [clearDragState, ordered, reorder],
  );

  return (
    <div className="sidebar-order-list">
      {ordered.map((id, index) => {
        const dragging = dragId === id;
        const dropTarget = dropTargetId === id && dragId !== id;
        return (
          <div
            key={id}
            className={[
              'sidebar-order-row',
              dragging ? 'sidebar-order-row--dragging' : '',
              dropTarget ? 'sidebar-order-row--drop-target' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onDragOver={(event) => handleDragOver(event, id)}
            onDrop={(event) => handleDrop(event, id)}
          >
            <div className="sidebar-order-row-main">
              <span
                role="button"
                tabIndex={0}
                className="sidebar-order-handle"
                draggable
                aria-label={`Drag to reorder ${MODULE_BY_ID[id].name}`}
                onDragStart={(event) => handleDragStart(event, id)}
                onDragEnd={clearDragState}
                onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
                  if (event.key === ' ' || event.key === 'Enter') event.preventDefault();
                }}
              >
                <GripVertical aria-hidden />
              </span>
              <span>{MODULE_BY_ID[id].name}</span>
            </div>
            <div className="sidebar-order-actions">
              <button
                type="button"
                aria-label={`Move ${MODULE_BY_ID[id].name} up`}
                disabled={index === 0}
                onClick={() => void move(id, -1)}
              >
                <ArrowUp />
              </button>
              <button
                type="button"
                aria-label={`Move ${MODULE_BY_ID[id].name} down`}
                disabled={index === ordered.length - 1}
                onClick={() => void move(id, 1)}
              >
                <ArrowDown />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
