import { create } from 'zustand';
import type { Note } from '@/types';
import { getNotes, createNote, updateNote, deleteNote, toggleNoteShare } from '@/services/api';

export type LayoutMode = 'grid' | 'random';

interface NotesStore {
  notes: Note[];
  isLoading: boolean;
  searchQuery: string;
  layoutMode: LayoutMode;
  fetchNotes: (userId: string) => Promise<void>;
  addNote: (userId: string, content: string, color?: string) => Promise<void>;
  updateNote: (userId: string, noteId: string, updates: Partial<Pick<Note, 'content' | 'is_checked' | 'color' | 'position_x' | 'position_y' | 'angle' | 'share_token' | 'is_public'>>) => Promise<void>;
  deleteNote: (userId: string, noteId: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  getFilteredNotes: () => Note[];
  setLayoutMode: (mode: LayoutMode) => void;
  randomizePositions: () => void;
  alignNotes: () => void;
  toggleShare: (userId: string, noteId: string) => Promise<void>;
}

function getRandomPosition(): { x: number; y: number; angle: number } {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const cardWidth = isMobile ? 180 : 220;
  const cardHeight = isMobile ? 130 : 140;
  const horizontalMargin = isMobile ? 12 : 16;
  const verticalMargin = isMobile ? 12 : 20;
  const angleRange = isMobile ? 6 : 10;

  const left = horizontalMargin + Math.random() * Math.max((typeof window !== 'undefined' ? window.innerWidth : 1200) - cardWidth - horizontalMargin * 2, 0);
  const top = verticalMargin + Math.random() * Math.max((typeof window !== 'undefined' ? window.innerHeight : 800) - cardHeight - verticalMargin * 2, 0);
  const angle = (Math.random() - 0.5) * angleRange;

  return { x: left, y: top, angle };
}

export const useNotesStore = create<NotesStore>((set, get) => ({
  notes: [],
  isLoading: false,
  searchQuery: '',
  layoutMode: 'grid',

  fetchNotes: async (userId) => {
    set({ isLoading: true });
    try {
      const notes = await getNotes(userId);
      const notesWithPositions = notes.map(note => {
        if (note.position_x === undefined || note.position_y === undefined) {
          const pos = getRandomPosition();
          return { ...note, position_x: pos.x, position_y: pos.y, angle: pos.angle };
        }
        return note;
      });
      set({ notes: notesWithPositions, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  addNote: async (userId, content, color) => {
    try {
      const note = await createNote(userId, content, color);
      set((state) => ({ notes: [note, ...state.notes] }));
    } catch (error) {
      console.error('Failed to add note:', error);
    }
  },

  updateNote: async (userId, noteId, updates) => {
    try {
      await updateNote(userId, noteId, updates);
      set((state) => ({
        notes: state.notes.map(n => n.id === noteId ? { ...n, ...updates, updated_at: new Date().toISOString() } : n),
      }));
    } catch (error) {
      console.error('Failed to update note:', error);
    }
  },

  deleteNote: async (userId, noteId) => {
    try {
      await deleteNote(userId, noteId);
      set((state) => ({ notes: state.notes.filter(n => n.id !== noteId) }));
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  getFilteredNotes: () => {
    const { notes, searchQuery } = get();
    if (!searchQuery.trim()) return notes;
    const query = searchQuery.toLowerCase();
    return notes.filter(n => {
      const contentMatch = n.content.toLowerCase().includes(query);
      const title = new Date(n.created_at).toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const titleLower = title.toLowerCase();
      const titleMatch = titleLower.includes(query) || title.includes(searchQuery);
      return contentMatch || titleMatch;
    });
  },

  setLayoutMode: (mode) => {
    set({ layoutMode: mode });
  },

  randomizePositions: () => {
    set((state) => ({
      layoutMode: 'random',
      notes: state.notes.map(note => {
        const pos = getRandomPosition();
        return { ...note, position_x: pos.x, position_y: pos.y, angle: pos.angle };
      }),
    }));
  },

  alignNotes: () => {
    set((state) => ({
      layoutMode: 'grid',
      notes: state.notes.map((note, index) => {
        const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
        const cardWidth = isMobile ? 180 : 220;
        const cardHeight = isMobile ? 130 : 140;
        const gap = 24;
        const cols = isMobile ? 2 : Math.floor((typeof window !== 'undefined' ? window.innerWidth : 1200) / (cardWidth + gap));

        const col = index % cols;
        const row = Math.floor(index / cols);

        return {
          ...note,
          position_x: col * (cardWidth + gap) + 24,
          position_y: row * (cardHeight + gap) + 24,
          angle: 0,
        };
      }),
    }));
  },

  toggleShare: async (userId, noteId) => {
    try {
      const updatedNote = await toggleNoteShare(userId, noteId);
      set((state) => ({
        notes: state.notes.map(n => n.id === noteId ? updatedNote : n),
      }));
    } catch (error) {
      console.error('Failed to toggle share:', error);
    }
  },
}));