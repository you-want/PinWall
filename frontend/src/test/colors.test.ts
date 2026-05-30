import { describe, it, expect } from 'vitest'
import { STICKY_COLORS, getRandomColor } from '@/utils/colors'

describe('colors', () => {
  describe('STICKY_COLORS', () => {
    it('should be an array of color strings', () => {
      expect(Array.isArray(STICKY_COLORS)).toBe(true)
      expect(STICKY_COLORS.length).toBeGreaterThan(0)
    })

    it('should contain valid hex color format', () => {
      STICKY_COLORS.forEach(color => {
        expect(color).toMatch(/^#[a-fA-F0-9]{6}$/)
      })
    })
  })

  describe('getRandomColor', () => {
    it('should return a color from STICKY_COLORS', () => {
      const color = getRandomColor()
      expect(STICKY_COLORS).toContain(color)
    })

    it('should return different colors on multiple calls', () => {
      const colors = new Set()
      for (let i = 0; i < 20; i++) {
        colors.add(getRandomColor())
      }
      expect(colors.size).toBeGreaterThan(1)
    })
  })
})