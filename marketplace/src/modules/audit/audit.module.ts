import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { WidgetsModule } from '../widgets/widgets.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [WidgetsModule, AuthModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
