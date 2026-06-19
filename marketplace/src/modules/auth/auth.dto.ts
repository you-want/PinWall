import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'dev@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John Developer' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class LoginDto {
  @ApiProperty({ example: 'dev@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  password: string;
}

export class LoginResponseDto {
  accessToken: string;
  developer: {
    id: string;
    email: string;
    name: string;
  };
}
