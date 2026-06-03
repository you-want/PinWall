import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Wall from '@/routes/Wall'
import { useNotesStore } from '@/stores/notesStore'
import { useAuthStore } from '@/stores/authStore'
import type { Note, User } from '@/types'

vi.mock('@/services/api', () => ({
  getNotes: vi.fn().mockResolvedValue([]),
  createNote: vi.fn().mockResolvedValue({}),
  updateNote: vi.fn().mockResolvedValue({}),
  deleteNote: vi.fn().mockResolvedValue(undefined),
  toggleNoteShare: vi.fn().mockResolvedValue({}),
}))

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

describe('Wall 组件', () => {
  beforeEach(() => {
    useNotesStore.setState({
      notes: [],
      isLoading: false,
      searchQuery: '',
      layoutMode: 'grid',
    })
    useAuthStore.setState({ user: mockUser, isLoading: false, error: null })
    vi.clearAllMocks()
  })

  // ─── Bug 2 ────────────────────────────────────────────────────────────────
  describe('Bug2: 最大化便签时 hover 频闪', () => {
    it('无全屏卡片时 wall-container 不含 has-fullscreen class', () => {
      const notes = [createMockNote({ id: '1' }), createMockNote({ id: '2' })]
      useNotesStore.setState({ notes, layoutMode: 'random' })

      const { container } = render(<Wall />)
      const wallEl = container.querySelector('.wall-container')!
      expect(wallEl.classList.contains('has-fullscreen')).toBe(false)
    })

    it('点击全屏后 wall-container 获得 has-fullscreen class', async () => {
      const notes = [createMockNote({ id: '1' })]
      useNotesStore.setState({ notes, layoutMode: 'random' })

      const { container } = render(<Wall />)

      // 点击全屏按钮
      const fullscreenBtn = screen.getByLabelText('全屏')
      fireEvent.click(fullscreenBtn)

      // MutationObserver 是异步的，等待状态更新
      await vi.waitFor(() => {
        const wallEl = container.querySelector('.wall-container')!
        expect(wallEl.classList.contains('has-fullscreen')).toBe(true)
      })
    })

    it('退出全屏后 has-fullscreen class 被移除', async () => {
      const notes = [createMockNote({ id: '1' })]
      useNotesStore.setState({ notes, layoutMode: 'random' })

      const { container } = render(<Wall />)

      // 全屏
      fireEvent.click(screen.getByLabelText('全屏'))
      await vi.waitFor(() => {
        expect(container.querySelector('.wall-container')!.classList.contains('has-fullscreen')).toBe(true)
      })

      // 退出全屏（点击"恢复"按钮）
      const restoreBtn = screen.getByLabelText('恢复')
      fireEvent.click(restoreBtn)

      await vi.waitFor(() => {
        expect(container.querySelector('.wall-container')!.classList.contains('has-fullscreen')).toBe(false)
      })
    })
  })

  // ─── Bug 3 FAB ────────────────────────────────────────────────────────────
  describe('Bug3: 新建便签按钮（FAB）', () => {
    it('页面有可见的新建便签浮动按钮', () => {
      const notes = [createMockNote()]
      useNotesStore.setState({ notes })

      render(<Wall />)

      const fab = screen.getByLabelText('新建便签')
      expect(fab).toBeTruthy()
      expect(fab.tagName).toBe('BUTTON')
      expect(fab.classList.contains('fab-new-note')).toBe(true)
    })

    it('FAB 按钮 title 包含操作提示', () => {
      const notes = [createMockNote()]
      useNotesStore.setState({ notes })

      render(<Wall />)

      const fab = screen.getByLabelText('新建便签')
      expect(fab.getAttribute('title')).toContain('双击')
    })

    it('全屏时 FAB 按钮隐藏（避免遮挡）', async () => {
      const notes = [createMockNote()]
      useNotesStore.setState({ notes, layoutMode: 'random' })

      render(<Wall />)

      // 先确认 FAB 存在
      expect(screen.queryByLabelText('新建便签')).toBeTruthy()

      // 进入全屏
      fireEvent.click(screen.getByLabelText('全屏'))

      await vi.waitFor(() => {
        expect(screen.queryByLabelText('新建便签')).toBeNull()
      })
    })

    it('点击 FAB 打开新建便签编辑器', () => {
      const notes = [createMockNote()]
      useNotesStore.setState({ notes })

      render(<Wall />)

      const fab = screen.getByLabelText('新建便签')
      fireEvent.click(fab)

      // NoteEditor 应该出现（标题为"新建便签"）
      expect(screen.getByText('新建便签')).toBeTruthy()
    })
  })
})
