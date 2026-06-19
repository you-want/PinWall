import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Widget, WidgetVersion, Review } from '../../entities';
import { WidgetsController } from './widgets.controller';
import { WidgetsService } from './widgets.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Widget, WidgetVersion, Review]),
    AuthModule,
  ],
  controllers: [WidgetsController],
  providers: [WidgetsService],
  exports: [WidgetsService],
})
export class WidgetsModule {}
