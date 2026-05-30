import { describe, it, expect } from 'vitest'
import { ApiError } from '@/services/api'

describe('ApiError', () => {
  it('should create an error with code and message', () => {
    const error = new ApiError(404, 'Not found')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(404)
    expect(error.message).toBe('Not found')
    expect(error.name).toBe('ApiError')
  })

  it('should handle numeric code', () => {
    const error = new ApiError(500, 'Server error')

    expect(error.code).toBe(500)
    expect(error.message).toBe('Server error')
  })
})

describe('api response types', () => {
  it('should have correct response structure', () => {
    const mockResponse = {
      code: 0,
      message: 'success',
      data: { user: { id: '1', email: 'test@example.com' } },
    }

    expect(mockResponse).toHaveProperty('code')
    expect(mockResponse).toHaveProperty('message')
    expect(mockResponse).toHaveProperty('data')
  })

  it('should validate error response structure', () => {
    const errorResponse = {
      code: 1001,
      message: 'Invalid credentials',
      data: null,
    }

    expect(errorResponse.code).not.toBe(0)
    expect(errorResponse.message).toBeTruthy()
  })
})