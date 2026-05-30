import { describe, it, expect, beforeEach } from 'vitest'
import type { User, Note } from '@/types'
import { useNotesStore } from '@/stores/notesStore'
import { useAuthStore } from '@/stores/authStore'

const mockUser: User = {
  id: 'user-1',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
}

const createMockNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'note-1',
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
  ...overrides,
})

describe('User Authentication State', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isLoading: false,
      error: null,
    })
  })

  it('should start with null user', () => {
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().isLoading).toBe(false)
    expect(useAuthStore.getState().error).toBeNull()
  })

  it('should set user on login', () => {
    useAuthStore.setState({ user: mockUser })
    expect(useAuthStore.getState().user).not.toBeNull()
    expect(useAuthStore.getState().user?.email).toBe('test@example.com')
  })

  it('should clear user on logout', () => {
    useAuthStore.setState({ user: mockUser })
    expect(useAuthStore.getState().user).not.toBeNull()

    useAuthStore.getState().logout()

    expect(useAuthStore.getState().user).toBeNull()
  })

  it('should handle login error state', () => {
    useAuthStore.setState({ error: 'Invalid credentials' })
    expect(useAuthStore.getState().error).toBe('Invalid credentials')
  })

  it('should handle loading state', () => {
    useAuthStore.setState({ isLoading: true })
    expect(useAuthStore.getState().isLoading).toBe(true)
  })
})

describe('Notes State Management', () => {
  beforeEach(() => {
    useNotesStore.setState({
      notes: [],
      isLoading: false,
      searchQuery: '',
      layoutMode: 'grid',
    })
  })

  it('should start with empty notes', () => {
    expect(useNotesStore.getState().notes).toEqual([])
    expect(useNotesStore.getState().isLoading).toBe(false)
  })

  it('should add notes to state', () => {
    const notes = [
      createMockNote({ id: '1', content: 'First note' }),
      createMockNote({ id: '2', content: 'Second note' }),
    ]
    useNotesStore.setState({ notes })

    expect(useNotesStore.getState().notes).toHaveLength(2)
  })

  it('should update note content', () => {
    const note = createMockNote({ id: '1', content: 'Original' })
    useNotesStore.setState({ notes: [note] })

    const updatedNotes = useNotesStore.getState().notes.map(n =>
      n.id === '1' ? { ...n, content: 'Updated' } : n
    )
    useNotesStore.setState({ notes: updatedNotes })

    expect(useNotesStore.getState().notes[0].content).toBe('Updated')
  })

  it('should toggle note checked state', () => {
    const note = createMockNote({ id: '1', is_checked: false })
    useNotesStore.setState({ notes: [note] })

    const updatedNotes = useNotesStore.getState().notes.map(n =>
      n.id === '1' ? { ...n, is_checked: true } : n
    )
    useNotesStore.setState({ notes: updatedNotes })

    expect(useNotesStore.getState().notes[0].is_checked).toBe(true)
  })

  it('should delete note from state', () => {
    const notes = [
      createMockNote({ id: '1' }),
      createMockNote({ id: '2' }),
    ]
    useNotesStore.setState({ notes })

    const filteredNotes = useNotesStore.getState().notes.filter(n => n.id !== '1')
    useNotesStore.setState({ notes: filteredNotes })

    expect(useNotesStore.getState().notes).toHaveLength(1)
    expect(useNotesStore.getState().notes[0].id).toBe('2')
  })

  it('should filter notes by search query', () => {
    const notes = [
      createMockNote({ id: '1', content: 'Morning standup' }),
      createMockNote({ id: '2', content: 'Code review' }),
      createMockNote({ id: '3', content: 'Lunch break' }),
    ]
    useNotesStore.setState({ notes })
    useNotesStore.getState().setSearchQuery('standup')

    const filtered = useNotesStore.getState().getFilteredNotes()

    expect(filtered).toHaveLength(1)
    expect(filtered[0].content).toBe('Morning standup')
  })

  it('should return all notes when search is empty', () => {
    const notes = [
      createMockNote({ id: '1', content: 'First' }),
      createMockNote({ id: '2', content: 'Second' }),
    ]
    useNotesStore.setState({ notes })

    const filtered = useNotesStore.getState().getFilteredNotes()

    expect(filtered).toHaveLength(2)
  })

  it('should switch layout mode', () => {
    expect(useNotesStore.getState().layoutMode).toBe('grid')

    useNotesStore.getState().setLayoutMode('random')
    expect(useNotesStore.getState().layoutMode).toBe('random')

    useNotesStore.getState().setLayoutMode('grid')
    expect(useNotesStore.getState().layoutMode).toBe('grid')
  })
})

describe('Full User Workflow', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null })
    useNotesStore.setState({ notes: [], searchQuery: '' })
  })

  it('should complete user session flow', () => {
    useAuthStore.setState({ user: mockUser })
    expect(useAuthStore.getState().user).not.toBeNull()

    const notes = [
      createMockNote({ id: '1', content: 'Morning standup' }),
      createMockNote({ id: '2', content: 'Code review' }),
      createMockNote({ id: '3', content: 'Lunch break', is_checked: true }),
    ]
    useNotesStore.setState({ notes })

    expect(useNotesStore.getState().notes).toHaveLength(3)

    const uncheckedNotes = useNotesStore.getState().notes.filter(n => !n.is_checked)
    expect(uncheckedNotes).toHaveLength(2)

    useAuthStore.getState().logout()
    useNotesStore.setState({ notes: [] })

    expect(useAuthStore.getState().user).toBeNull()
    expect(useNotesStore.getState().notes).toHaveLength(0)
  })

  it('should track note completion progress', () => {
    const notes = [
      createMockNote({ id: '1', is_checked: false }),
      createMockNote({ id: '2', is_checked: true }),
      createMockNote({ id: '3', is_checked: false }),
    ]
    useNotesStore.setState({ notes })

    const checkedCount = useNotesStore.getState().notes.filter(n => n.is_checked).length
    const uncheckedCount = useNotesStore.getState().notes.filter(n => !n.is_checked).length

    expect(checkedCount).toBe(1)
    expect(uncheckedCount).toBe(2)
  })
})