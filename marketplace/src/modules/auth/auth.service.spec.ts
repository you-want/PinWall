import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { Developer } from '../../entities';
import * as bcrypt from 'bcrypt';

jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234',
}));

describe('AuthService', () => {
  let service: AuthService;
  let repo: Record<string, jest.Mock>;
  let jwtService: { sign: jest.Mock };

  const mockDeveloper: Partial<Developer> = {
    id: 'dev-1',
    email: 'test@example.com',
    name: 'Test Dev',
    passwordHash: 'hashed',
    apiKey: 'pw_testkey',
    isVerified: false,
  };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    jwtService = { sign: jest.fn().mockReturnValue('jwt-token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(Developer), useValue: repo },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('registers a new developer', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(mockDeveloper);
      repo.save.mockResolvedValue(mockDeveloper);

      const result = await service.register({
        email: 'test@example.com',
        name: 'Test Dev',
        password: 'password123',
      });

      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('Test Dev');
      expect(result.apiKey).toBeDefined();
      expect(repo.save).toHaveBeenCalled();
    });

    it('throws ConflictException for duplicate email', async () => {
      repo.findOne.mockResolvedValue(mockDeveloper);

      await expect(
        service.register({
          email: 'test@example.com',
          name: 'Test Dev',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('returns JWT on valid credentials', async () => {
      const hash = await bcrypt.hash('password123', 12);
      repo.findOne.mockResolvedValue({ ...mockDeveloper, passwordHash: hash });

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('jwt-token');
      expect(result.developer.email).toBe('test@example.com');
      expect(jwtService.sign).toHaveBeenCalled();
    });

    it('throws UnauthorizedException for unknown email', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@example.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const hash = await bcrypt.hash('correct', 12);
      repo.findOne.mockResolvedValue({ ...mockDeveloper, passwordHash: hash });

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateApiKey', () => {
    it('returns developer for valid key', async () => {
      repo.findOne.mockResolvedValue(mockDeveloper);
      const result = await service.validateApiKey('pw_testkey');
      expect(result).toEqual(mockDeveloper);
    });

    it('returns null for invalid key', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.validateApiKey('invalid');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns developer by id', async () => {
      repo.findOne.mockResolvedValue(mockDeveloper);
      const result = await service.findById('dev-1');
      expect(result).toEqual(mockDeveloper);
    });
  });
});
