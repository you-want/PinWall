import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useNotesStore } from '@/stores/notesStore'
import type { Note } from '@/types'

vi.mock('@/services/api', () => ({
  getNotes: vi.fn().mockResolvedValue([]),
  createNote: vi.fn().mockResolvedValue({}),
  updateNote: vi.fn().mockResolvedValue({}),
  deleteNote: vi.fn().mockResolvedValue(undefined),
  toggleNoteShare: vi.fn().mockResolvedValue({}),
}))

const mockNote: Note = {
  id: '1',
  user_id: 'user-1',
  content: 'Test note',
  is_checked: false,
  color: '#fef3c7',
  position_x: 100,
  position_y: 100,
  angle: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  is_public: false,
  share_token: null,
}

describe('notesStore', () => {
  beforeEach(() => {
    useNotesStore.setState({
      notes: [],
      isLoading: false,
      searchQuery: '',
      layoutMode: 'grid',
    })
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should have empty notes array', () => {
      const { notes, isLoading, searchQuery, layoutMode } = useNotesStore.getState()
      expect(notes).toEqual([])
      expect(isLoading).toBe(false)
      expect(searchQuery).toBe('')
      expect(layoutMode).toBe('grid')
    })
  })

  describe('setSearchQuery', () => {
    it('should update search query', () => {
      useNotesStore.getState().setSearchQuery('test')
      expect(useNotesStore.getState().searchQuery).toBe('test')
    })
  })

  describe('setLayoutMode', () => {
    it('should update layout mode to random', () => {
      useNotesStore.getState().setLayoutMode('random')
      expect(useNotesStore.getState().layoutMode).toBe('random')
    })

    it('should update layout mode to grid', () => {
      useNotesStore.setState({ layoutMode: 'random' })
      useNotesStore.getState().setLayoutMode('grid')
      expect(useNotesStore.getState().layoutMode).toBe('grid')
    })
  })

  describe('getFilteredNotes', () => {
    it('should return all notes when search query is empty', () => {
      useNotesStore.setState({ notes: [mockNote] })
      const filtered = useNotesStore.getState().getFilteredNotes()
      expect(filtered).toHaveLength(1)
    })

    it('should filter notes by content', () => {
      const notes = [
        { ...mockNote, id: '1', content: 'First note' },
        { ...mockNote, id: '2', content: 'Second note' },
      ]
      useNotesStore.setState({ notes })
      useNotesStore.getState().setSearchQuery('first')
      const filtered = useNotesStore.getState().getFilteredNotes()
      expect(filtered).toHaveLength(1)
      expect(filtered[0].content).toBe('First note')
    })

    it('should be case insensitive', () => {
      useNotesStore.setState({ notes: [mockNote] })
      useNotesStore.getState().setSearchQuery('TEST')
      const filtered = useNotesStore.getState().getFilteredNotes()
      expect(filtered).toHaveLength(1)
    })
  })

  describe('randomizePositions', () => {
    it('should change layout mode to random', () => {
      useNotesStore.setState({ layoutMode: 'grid' })
      useNotesStore.getState().randomizePositions()
      expect(useNotesStore.getState().layoutMode).toBe('random')
    })

    it('should update note positions', () => {
      useNotesStore.setState({ notes: [mockNote] })
      useNotesStore.getState().randomizePositions()
      const updatedNote = useNotesStore.getState().notes[0]
      expect(updatedNote.position_x).toBeDefined()
      expect(updatedNote.position_y).toBeDefined()
    })
  })

  describe('alignNotes', () => {
    it('should change layout mode to grid', () => {
      useNotesStore.setState({ layoutMode: 'random' })
      useNotesStore.getState().alignNotes()
      expect(useNotesStore.getState().layoutMode).toBe('grid')
    })

    it('should set all angles to 0', () => {
      const notesWithAngle = [{ ...mockNote, angle: 15 }, { ...mockNote, id: '2', angle: -10 }]
      useNotesStore.setState({ notes: notesWithAngle })
      useNotesStore.getState().alignNotes()
      const updatedNotes = useNotesStore.getState().notes
      updatedNotes.forEach(note => {
        expect(note.angle).toBe(0)
      })
    })
  })

  describe('store state manipulation', () => {
    it('should add note to state directly', () => {
      useNotesStore.setState({ notes: [mockNote] })
      expect(useNotesStore.getState().notes).toHaveLength(1)
    })

    it('should remove note from state directly', () => {
      useNotesStore.setState({ notes: [mockNote] })
      useNotesStore.setState({ notes: [] })
      expect(useNotesStore.getState().notes).toHaveLength(0)
    })

    it('should update note in state directly', () => {
      useNotesStore.setState({ notes: [mockNote] })
      const updatedNotes = useNotesStore.getState().notes.map(n =>
        n.id === '1' ? { ...n, content: 'Updated' } : n
      )
      useNotesStore.setState({ notes: updatedNotes })
      expect(useNotesStore.getState().notes[0].content).toBe('Updated')
    })
  })
})