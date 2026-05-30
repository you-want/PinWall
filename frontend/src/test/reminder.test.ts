import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getDefaultConfig,
  loadReminderConfig,
  saveReminderConfig,
  getNextReminderTime,
  getTimeUntilNextReminder,
  formatTime,
} from '@/utils/reminder'

describe('reminder', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  describe('getDefaultConfig', () => {
    it('should return default reminder config', () => {
      const config = getDefaultConfig()
      expect(config).toEqual({
        enabled: false,
        hour: 21,
        minute: 0,
      })
    })
  })

  describe('loadReminderConfig', () => {
    it('should return default config when nothing stored', () => {
      const config = loadReminderConfig()
      expect(config).toEqual(getDefaultConfig())
    })

    it('should return stored config', () => {
      const customConfig = { enabled: true, hour: 10, minute: 30 }
      localStorage.setItem('pinwall_reminder_config', JSON.stringify(customConfig))
      const config = loadReminderConfig()
      expect(config).toEqual(customConfig)
    })

    it('should handle invalid JSON gracefully', () => {
      localStorage.setItem('pinwall_reminder_config', 'invalid-json')
      const config = loadReminderConfig()
      expect(config).toEqual(getDefaultConfig())
    })
  })

  describe('saveReminderConfig', () => {
    it('should save config to localStorage', () => {
      const config = { enabled: true, hour: 8, minute: 15 }
      saveReminderConfig(config)
      const stored = localStorage.getItem('pinwall_reminder_config')
      expect(stored).toBe(JSON.stringify(config))
    })
  })

  describe('getNextReminderTime', () => {
    it('should return tomorrow if time has passed today', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T22:00:00'))
      
      const config = { enabled: true, hour: 21, minute: 0 }
      const next = getNextReminderTime(config)
      
      expect(next.getDate()).toBe(2)
      expect(next.getHours()).toBe(21)
      expect(next.getMinutes()).toBe(0)
      
      vi.useRealTimers()
    })

    it('should return today if time has not passed', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T10:00:00'))
      
      const config = { enabled: true, hour: 21, minute: 0 }
      const next = getNextReminderTime(config)
      
      expect(next.getDate()).toBe(1)
      expect(next.getHours()).toBe(21)
      expect(next.getMinutes()).toBe(0)
      
      vi.useRealTimers()
    })
  })

  describe('getTimeUntilNextReminder', () => {
    it('should return positive delay', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T10:00:00'))
      
      const config = { enabled: true, hour: 21, minute: 0 }
      const delay = getTimeUntilNextReminder(config)
      
      expect(delay).toBeGreaterThan(0)
      
      vi.useRealTimers()
    })
  })

  describe('formatTime', () => {
    it('should format time with leading zeros', () => {
      expect(formatTime(9, 5)).toBe('09:05')
      expect(formatTime(21, 0)).toBe('21:00')
      expect(formatTime(23, 59)).toBe('23:59')
    })
  })
})