import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// Feature module for the bell (RUN-65). The service is exported because the
// modules whose actions cause notifications (follow, runs) call its writers
// inside their own transactions; the dependency only ever points this way -
// notifications imports nothing from them, so no cycle can form.
// PrismaModule is imported explicitly on purpose - see prisma.module.ts.
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
