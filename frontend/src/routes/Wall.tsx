import { useState, useCallback, useEffect } from 'react';
import { StickyNote } from '@/components/StickyNote';
import { NoteEditor } from '@/components/NoteEditor';
import { useNotesStore } from '@/stores/notesStore';
import { useAuthStore } from '@/stores/authStore';
import type { Note } from '@/types';

export default function Wall() {
  const { notes, layoutMode, fetchNotes, alignNotes, randomizePositions } = useNotesStore();
  const { user, logout } = useAuthStore();
  const [showEditor, setShowEditor] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (user) {
      fetchNotes();
    }
  }, [user, fetchNotes]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.sticky-card')) return;
    setShowEditor(true);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if ((e.target as HTMLElement).closest('.sticky-card')) return;
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setContextMenu(null);
  }, [logout]);

  const downloadFile = useCallback((content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const exportNotesAsMarkdown = useCallback(() => {
    const markdown = notes.map((note, index) => {
      const status = note.is_checked ? '✅' : '⬜';
      const date = new Date(note.created_at).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
      });
      return `## ${index + 1}. ${status} ${date}\n\n${note.content}\n\n`;
    }).join('');

    downloadFile(markdown, 'notes.md', 'text/markdown');
    setContextMenu(null);
  }, [notes, downloadFile]);

  const exportNotesAsJSON = useCallback(() => {
    const data = notes.map(note => ({
      id: note.id,
      content: note.content,
      is_checked: note.is_checked,
      color: note.color,
      created_at: note.created_at,
      updated_at: note.updated_at,
    }));

    downloadFile(JSON.stringify(data, null, 2), 'notes.json', 'application/json');
    setContextMenu(null);
  }, [notes, downloadFile]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className="wall-container"
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onClick={handleCloseContextMenu}
    >
      {notes.length === 0 ? (
        <div className="empty-state">
          <div className="text-6xl mb-4">📝</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">暂无便签</h2>
          <p className="text-gray-500">双击空白处创建新便签</p>
        </div>
      ) : layoutMode === 'random' ? (
        <div className="notes-grid random">
          {notes.map((note: Note) => (
            <StickyNote key={note.id} note={note} />
          ))}
        </div>
      ) : (
        <div className="masonry-container">
          {notes.map((note: Note) => (
            <div key={note.id} className="masonry-item">
              <StickyNote note={note} />
            </div>
          ))}
        </div>
      )}

      {showEditor && (
        <NoteEditor
          onClose={() => setShowEditor(false)}
        />
      )}

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => { alignNotes(); setContextMenu(null); }} className="context-menu-item">
            整齐排列
          </button>
          <button onClick={() => { randomizePositions(); setContextMenu(null); }} className="context-menu-item">
            随机分布
          </button>
          <hr className="context-menu-divider" />
          <button onClick={exportNotesAsMarkdown} className="context-menu-item">
            导出 Markdown
          </button>
          <button onClick={exportNotesAsJSON} className="context-menu-item">
            导出 JSON
          </button>
          <hr className="context-menu-divider" />
          <button onClick={handleLogout} className="context-menu-item danger">
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}