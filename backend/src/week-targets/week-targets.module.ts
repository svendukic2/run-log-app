import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WeekTargetsController } from './week-targets.controller';
import { WeekTargetsService } from './week-targets.service';

// Feature module for the per-week target snapshots (RUN-49). Deliberately
// its OWN module rather than part of goal or profile: the snapshot seed
// reads goal state AND profile state (see snapshotKm), and both of those
// modules need the freeze path when their seed value changes (SET-6). As
// part of either one, the other's dependency would be a cycle; standalone,
// the arrows point one way. PrismaModule is imported explicitly on
// purpose - see prisma.module.ts.
@Module({
  imports: [PrismaModule],
  controllers: [WeekTargetsController],
  providers: [WeekTargetsService],
  // Exported for ProfileModule and GoalModule: changing what new weeks
  // would snapshot must freeze the running week first, and that freeze is
  // the ensure() path.
  exports: [WeekTargetsService],
})
export class WeekTargetsModule {}
