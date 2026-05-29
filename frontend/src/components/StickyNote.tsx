import { useState, useRef, useCallback, useEffect } from 'react';
import type { Note } from '@/types';
import { useNotesStore } from '@/stores/notesStore';
import { ConfirmModal } from './ConfirmModal';

interface StickyNoteProps {
  note: Note;
  userId: string;
}

const beijingDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Shanghai',
});

function parseApiDate(input: string): Date {
  const raw = input.trim();
  const hasTimeZone = /([zZ]|[+-]\d{2}:\d{2})$/.test(raw);

  if (hasTimeZone) {
    return new Date(raw);
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)) {
    return new Date(raw.replace(' ', 'T') + 'Z');
  }

  return new Date(raw);
}

export function StickyNote({ note, userId }: StickyNoteProps) {
  const { updateNote, deleteNote, layoutMode } = useNotesStore();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const localPositionRef = useRef({ x: note.position_x || 0, y: note.position_y || 0 });
  const pendingUpdateRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const elementRef = useRef<HTMLDivElement>(null);

  const handleDelete = async () => {
    setShowConfirm(false);
    setIsLoading(true);
    await deleteNote(userId, note.id);
    setIsLoading(false);
  };

  const handleClose = () => {
    setShowConfirm(true);
  };

  const handleRestore = () => {
    setIsFullscreen(false);
  };

  const handleFullscreen = () => {
    setIsFullscreen(true);
  };

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (layoutMode !== 'random' || isFullscreen) return;

    const target = e.target as HTMLElement;
    if (target.closest('.control')) return;

    const header = target.closest('.sticky-card-header');
    if (!header) return;

    e.preventDefault();
    e.stopPropagation();

    setIsDragging(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = note.position_x || 0;
    const initialY = note.position_y || 0;

    localPositionRef.current = { x: initialX, y: initialY };
    pendingUpdateRef.current = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const newX = initialX + deltaX;
      const newY = initialY + deltaY;

      localPositionRef.current = { x: newX, y: newY };
      pendingUpdateRef.current = true;

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        if (elementRef.current) {
          elementRef.current.style.left = `${newX}px`;
          elementRef.current.style.top = `${newY}px`;
        }
      });
    };

    const handlePointerUp = () => {
      setIsDragging(false);

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (pendingUpdateRef.current) {
        const finalX = localPositionRef.current.x;
        const finalY = localPositionRef.current.y;
        updateNote(userId, note.id, { position_x: finalX, position_y: finalY });
      }

      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  }, [layoutMode, isFullscreen, note.position_x, note.position_y, note.id, updateNote, userId]);

  const isAbsolute = layoutMode === 'random';

  useEffect(() => {
    if (isAbsolute && elementRef.current && !isDragging && !isFullscreen) {
      elementRef.current.style.left = `${note.position_x || 0}px`;
      elementRef.current.style.top = `${note.position_y || 0}px`;
    }
  }, [note.position_x, note.position_y, isAbsolute, isDragging, isFullscreen]);

  return (
    <>
      <div
        ref={elementRef}
        className={`sticky-card ${isDragging ? 'dragging' : ''} ${note.is_checked ? 'checked' : ''} ${isAbsolute && !isFullscreen ? 'absolute' : ''} ${isFullscreen ? 'fullscreen' : ''}`}
        style={{
          backgroundColor: note.color,
          ...(isAbsolute && !isFullscreen && {
            left: `${note.position_x || 0}px`,
            top: `${note.position_y || 0}px`,
            transform: `rotate(${note.angle || 0}deg)`,
            transition: isDragging ? 'none' : 'left 0.1s ease, top 0.1s ease',
          }),
        }}
        onPointerDown={handlePointerDown}
      >
        <div className={`sticky-card-header ${isDragging ? 'dragging' : ''}`}>
          <div className="window-controls">
            <button
              onClick={handleClose}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              className="control close"
              type="button"
              aria-label="删除"
              title="删除便签"
            />
            <button
              onClick={handleRestore}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              disabled={!isFullscreen}
              className={`control minimize ${isFullscreen ? 'active' : 'disabled'}`}
              type="button"
              aria-label={isFullscreen ? '恢复' : '缩小'}
              title={isFullscreen ? '恢复' : '缩小'}
            />
            <button
              onClick={handleFullscreen}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              disabled={isFullscreen}
              className={`control green ${isFullscreen ? 'disabled' : ''}`}
              type="button"
              aria-label={isFullscreen ? '退出全屏' : '全屏'}
              title={isFullscreen ? '退出全屏' : '全屏'}
            />
          </div>
          <div className="card-title">
            {beijingDateTimeFormatter.format(parseApiDate(note.created_at))}
          </div>
        </div>
        <div className="sticky-card-body">
          {isLoading ? (
            <div className="loading-spinner" />
          ) : (
            <span className={note.is_checked ? 'line-through' : ''}>
              {note.content}
            </span>
          )}
        </div>
      </div>

      {showConfirm && (
        <ConfirmModal
          title="确认删除"
          message="确定要删除这个便签吗？此操作不可撤销。"
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
