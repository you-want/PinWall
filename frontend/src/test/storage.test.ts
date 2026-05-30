import { describe, it, expect, beforeEach } from 'vitest'
import {
  getStoredToken,
  setStoredToken,
  removeStoredToken,
  getStoredUser,
  setStoredUser,
  removeStoredUser,
} from '@/utils/storage'

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('token storage', () => {
    it('should return null when no token stored', () => {
      expect(getStoredToken()).toBeNull()
    })

    it('should store and retrieve token', () => {
      setStoredToken('test-token')
      expect(getStoredToken()).toBe('test-token')
    })

    it('should remove stored token', () => {
      setStoredToken('test-token')
      removeStoredToken()
      expect(getStoredToken()).toBeNull()
    })
  })

  describe('user storage', () => {
    it('should return null when no user stored', () => {
      expect(getStoredUser()).toBeNull()
    })

    it('should store and retrieve user', () => {
      const userJson = '{"id":"123","email":"test@example.com"}'
      setStoredUser(userJson)
      expect(getStoredUser()).toBe(userJson)
    })

    it('should remove stored user', () => {
      setStoredUser('{"id":"123"}')
      removeStoredUser()
      expect(getStoredUser()).toBeNull()
    })
  })
})