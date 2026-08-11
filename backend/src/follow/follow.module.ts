import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FollowController } from './follow.controller';
import { FollowService } from './follow.service';

// Feature module for the follow graph (RUN-61), the first community-phase
// entity. PrismaModule is imported explicitly on purpose - see
// prisma.module.ts.
@Module({
  imports: [PrismaModule],
  controllers: [FollowController],
  providers: [FollowService],
})
export class FollowModule {}
