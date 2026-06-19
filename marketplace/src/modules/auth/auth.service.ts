import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { Developer } from '../../entities';
import { RegisterDto, LoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Developer)
    private readonly developerRepo: Repository<Developer>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.developerRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const apiKey = `pw_${uuidv4().replace(/-/g, '')}`;

    const developer = this.developerRepo.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
      apiKey,
    });
    await this.developerRepo.save(developer);

    return {
      id: developer.id,
      email: developer.email,
      name: developer.name,
      apiKey: developer.apiKey,
    };
  }

  async login(dto: LoginDto) {
    const developer = await this.developerRepo.findOne({
      where: { email: dto.email },
    });
    if (!developer) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, developer.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: developer.id, email: developer.email };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      developer: {
        id: developer.id,
        email: developer.email,
        name: developer.name,
      },
    };
  }

  async validateApiKey(apiKey: string): Promise<Developer | null> {
    return this.developerRepo.findOne({ where: { apiKey } });
  }

  async findById(id: string): Promise<Developer | null> {
    return this.developerRepo.findOne({ where: { id } });
  }
}
