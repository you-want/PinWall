import { useState, useMemo } from 'react';
import type { Note } from '@/types';
import { useNotesStore } from '@/stores/notesStore';
import { STICKY_COLORS, getRandomColor } from '@/utils/colors';
import { X, Save, Loader2, Palette } from 'lucide-react';

interface NoteEditorProps {
  note?: Note | null;
  onClose: () => void;
}

export function NoteEditor({ note, onClose }: NoteEditorProps) {
  const initialContent = useMemo(() => note?.content || '', [note]);
  const initialColor = useMemo(() => note?.color || getRandomColor(), [note]);
  
  const [content, setContent] = useState(initialContent);
  const [selectedColor, setSelectedColor] = useState(initialColor);
  const [isLoading, setIsLoading] = useState(false);
  const { addNote, updateNoteState } = useNotesStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsLoading(true);
    if (note) {
      await updateNoteState(note.id, { 
        content: content.trim(),
        color: selectedColor,
      });
    } else {
      await addNote(content.trim(), selectedColor);
    }
    setIsLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">
            {note ? '编辑便签' : '新建便签'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <div
            className="mb-4 p-4 rounded-xl border-2 border-dashed border-gray-200"
            style={{ backgroundColor: selectedColor + '20' }}
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="写下你的便签内容..."
              className="w-full h-32 bg-transparent border-none outline-none resize-none text-gray-700 placeholder-gray-400"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Palette className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600">选择颜色</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {STICKY_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`w-8 h-8 rounded-full transition-all ${
                    selectedColor === color
                      ? 'ring-2 ring-offset-2 ring-amber-500 scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`选择颜色 ${color}`}
                />
              ))}
              <button
                type="button"
                onClick={() => setSelectedColor(getRandomColor())}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 via-pink-400 to-purple-500 hover:scale-105 transition-all flex items-center justify-center"
                title="随机颜色"
              >
                <span className="text-white text-xs">🎲</span>
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isLoading || !content.trim()}
              className="px-4 py-2 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-medium rounded-lg hover:from-amber-500 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  保存
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}