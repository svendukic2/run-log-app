import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FollowController } from './follow.controller';
import { FollowService } from './follow.service';

// Feature module for the follow graph (RUN-61), the first community-phase
// entity. PrismaModule is imported explicitly on purpose - see
// prisma.module.ts. NotificationsModule provides the writer the follow
// action calls inside its transaction (RUN-65).
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [FollowController],
  providers: [FollowService],
})
export class FollowModule {}
