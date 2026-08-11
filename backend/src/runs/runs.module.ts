import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

// Feature module for the runs entity (RUN-47), the thin slice that proves
// the whole database path. PrismaModule is imported explicitly on purpose -
// see prisma.module.ts. NotificationsModule provides the fan-out writer the
// create action calls inside its transaction (RUN-65).
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [RunsController],
  providers: [RunsService],
})
export class RunsModule {}
