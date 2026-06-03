import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { StickyNote } from '@/components/StickyNote'
import { useNotesStore } from '@/stores/notesStore'
import type { Note } from '@/types'

vi.mock('@/services/api', () => ({
  getNotes: vi.fn().mockResolvedValue([]),
  createNote: vi.fn().mockImplementation((content: string, color?: string) =>
    Promise.resolve({
      id: 'new-note',
      user_id: 'user-1',
      content,
      is_checked: false,
      color: color || '#fef3c7',
      position_x: 50,
      position_y: 50,
      angle: 0,
      created_at: '2024-06-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
      is_public: false,
      share_token: null,
    })
  ),
  updateNote: vi.fn().mockResolvedValue({}),
  deleteNote: vi.fn().mockResolvedValue(undefined),
  toggleNoteShare: vi.fn().mockResolvedValue({}),
}))

const createMockNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'note-1',
  user_id: 'user-1',
  content: 'Test note',
  is_checked: false,
  color: '#fef3c7',
  position_x: 100,
  position_y: 100,
  angle: 5,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  is_public: false,
  share_token: null,
  ...overrides,
})

const noop = () => {}

// ─── Bug 1 ────────────────────────────────────────────────────────────────────
describe('Bug1: 最右侧便签最大化后花屏', () => {
  beforeEach(() => {
    useNotesStore.setState({ notes: [], isLoading: false, searchQuery: '', layoutMode: 'random' })
  })

  it('全屏时 inline style 不应包含 transform（由 CSS fullscreen class 控制）', () => {
    const note = createMockNote({ angle: 15 })
    render(<StickyNote note={note} setNoteToEdit={noop} setShowEditor={noop} />)

    const fullscreenBtn = screen.getByLabelText('全屏')
    fireEvent.click(fullscreenBtn)

    const card = document.querySelector('.sticky-card')!
    expect(card.classList.contains('fullscreen')).toBe(true)
    expect(card.getAttribute('style')).not.toContain('transform')
  })

  it('全屏时 inline style 不应包含 transition（防止与 CSS transition:none 冲突）', () => {
    render(<StickyNote note={createMockNote()} setNoteToEdit={noop} setShowEditor={noop} />)

    fireEvent.click(screen.getByLabelText('全屏'))

    const card = document.querySelector('.sticky-card')!
    expect(card.classList.contains('fullscreen')).toBe(true)
    expect(card.getAttribute('style')).not.toContain('transition')
  })

  it('全屏时不应同时拥有 absolute class', () => {
    render(<StickyNote note={createMockNote()} setNoteToEdit={noop} setShowEditor={noop} />)

    fireEvent.click(screen.getByLabelText('全屏'))

    const card = document.querySelector('.sticky-card')!
    expect(card.classList.contains('absolute')).toBe(false)
    expect(card.classList.contains('fullscreen')).toBe(true)
  })
})

// ─── Bug 3 ────────────────────────────────────────────────────────────────────
describe('Bug3: 拖拽排布延迟 - inline transition 修复', () => {
  it('random 模式下卡片 inline style 不含 transition（消除拖拽回弹）', () => {
    useNotesStore.setState({ layoutMode: 'random' })
    render(<StickyNote note={createMockNote()} setNoteToEdit={noop} setShowEditor={noop} />)

    const card = document.querySelector('.sticky-card')!
    expect(card.classList.contains('absolute')).toBe(true)
    expect(card.getAttribute('style') || '').not.toContain('transition')
  })

  it('grid 模式下卡片 inline style 同样不含 transition', () => {
    useNotesStore.setState({ layoutMode: 'grid' })
    render(<StickyNote note={createMockNote()} setNoteToEdit={noop} setShowEditor={noop} />)

    const card = document.querySelector('.sticky-card')!
    expect(card.getAttribute('style') || '').not.toContain('transition')
  })
})

// ─── Bug 4 ────────────────────────────────────────────────────────────────────
describe('Bug4: 新建便签显示顺序 - addNote 应追加到末尾', () => {
  beforeEach(() => {
    useNotesStore.setState({ notes: [], isLoading: false, searchQuery: '', layoutMode: 'grid' })
    vi.clearAllMocks()
  })

  it('addNote 将新便签追加到数组末尾（不再前置）', async () => {
    const existing = createMockNote({ id: 'existing-1', content: '已有便签' })
    useNotesStore.setState({ notes: [existing] })

    await act(async () => {
      await useNotesStore.getState().addNote('新便签内容', '#fef3c7')
    })

    const notes = useNotesStore.getState().notes
    expect(notes).toHaveLength(2)
    expect(notes[0].id).toBe('existing-1')
    expect(notes[1].id).toBe('new-note')
  })

  it('连续添加多条便签，顺序与添加顺序一致', async () => {
    const existing = createMockNote({ id: 'existing-1', content: '第一条' })
    useNotesStore.setState({ notes: [existing] })

    const { createNote: mockCreate } = await import('@/services/api')
    let counter = 0
    vi.mocked(mockCreate).mockImplementation((content: string) => {
      counter++
      return Promise.resolve(createMockNote({ id: `created-${counter}`, content }))
    })

    await act(async () => {
      await useNotesStore.getState().addNote('第二条')
    })
    await act(async () => {
      await useNotesStore.getState().addNote('第三条')
    })

    const notes = useNotesStore.getState().notes
    expect(notes).toHaveLength(3)
    expect(notes.map(n => n.id)).toEqual(['existing-1', 'created-1', 'created-2'])
  })

  it('新建后数组顺序与 fetchNotes 返回顺序一致（刷新后不变）', async () => {
    // 重置 createNote mock，确保返回 new-note id
    const { createNote: mockCreate } = await import('@/services/api')
    vi.mocked(mockCreate).mockImplementation((content: string, color?: string) =>
      Promise.resolve({
        id: 'new-note',
        user_id: 'user-1',
        content,
        is_checked: false,
        color: color || '#fef3c7',
        position_x: 50,
        position_y: 50,
        angle: 0,
        created_at: '2024-06-01T00:00:00Z',
        updated_at: '2024-06-01T00:00:00Z',
        is_public: false,
        share_token: null,
      })
    )

    const existing = createMockNote({ id: 'note-a', content: 'A' })
    useNotesStore.setState({ notes: [existing] })

    await act(async () => {
      await useNotesStore.getState().addNote('B')
    })

    const notes = useNotesStore.getState().notes
    expect(notes[0].id).toBe('note-a')
    expect(notes[notes.length - 1].id).toBe('new-note')
  })
})
