import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Widget, Review, Developer } from '../../entities';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Developer, Widget, Review]), AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
