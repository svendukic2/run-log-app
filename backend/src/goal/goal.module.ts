import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WeekTargetsModule } from '../week-targets/week-targets.module';
import { GoalController } from './goal.controller';
import { GoalService } from './goal.service';

// Feature module for the onboarding goal record (RUN-49). PrismaModule is
// imported explicitly on purpose - see prisma.module.ts. WeekTargetsModule
// provides WeekTargetsService, which the SET-6 freeze in put() needs when
// the goal is the active seed (no profile yet).
@Module({
  imports: [PrismaModule, WeekTargetsModule],
  controllers: [GoalController],
  providers: [GoalService],
})
export class GoalModule {}
