import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET ?? 'pinwall-jwt-secret-change-in-production',
    });
  }

  async validate(payload: { sub: string; email: string }) {
    const developer = await this.authService.findById(payload.sub);
    if (!developer) {
      throw new UnauthorizedException();
    }
    return developer;
  }
}
