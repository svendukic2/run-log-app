import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WeekTargetsModule } from '../week-targets/week-targets.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

// Feature module for the per-user profile (RUN-49). PrismaModule is
// imported explicitly on purpose - see prisma.module.ts. WeekTargetsModule
// provides WeekTargetsService, which the SET-6 freeze in put() needs.
@Module({
  imports: [PrismaModule, WeekTargetsModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
