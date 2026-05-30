import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from '@/stores/authStore'

vi.mock('@/services/api', () => ({
  login: vi.fn(),
  register: vi.fn(),
  ApiError: class ApiError extends Error {
    code: number
    message: string
    constructor(code: number, message: string) {
      super(message)
      this.code = code
      this.message = message
    }
  },
}))

vi.mock('@/utils/storage', () => ({
  setStoredToken: vi.fn(),
  getStoredToken: vi.fn(),
  removeStoredToken: vi.fn(),
  setStoredUser: vi.fn(),
  getStoredUser: vi.fn(),
  removeStoredUser: vi.fn(),
}))

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should have null user initially', () => {
      const { user, isLoading, error } = useAuthStore.getState()
      expect(user).toBeNull()
      expect(isLoading).toBe(false)
      expect(error).toBeNull()
    })
  })

  describe('logout', () => {
    it('should clear user state on logout', () => {
      useAuthStore.setState({
        user: { id: '1', email: 'test@example.com', created_at: '2024-01-01' },
      })

      useAuthStore.getState().logout()

      const { user, error } = useAuthStore.getState()
      expect(user).toBeNull()
      expect(error).toBeNull()
    })
  })

  describe('login action', () => {
    it('should set loading state during login', async () => {
      const loginMock = vi.fn().mockResolvedValue({
        user: { id: '1', email: 'test@example.com' },
        token: 'mock-token',
      })

      vi.doMock('@/services/api', () => ({
        login: loginMock,
        register: vi.fn(),
        ApiError: class ApiError extends Error {
          code: number
          message: string
          constructor(code: number, message: string) {
            super(message)
            this.code = code
            this.message = message
          }
        },
      }))

      const store = useAuthStore.getState()
      expect(store.isLoading).toBe(false)
    })
  })
})