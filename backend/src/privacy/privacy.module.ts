import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

// Feature module for the account's privacy settings (RUN-64). PrismaModule
// is imported explicitly on purpose - see prisma.module.ts.
@Module({
  imports: [PrismaModule],
  controllers: [PrivacyController],
  providers: [PrivacyService],
})
export class PrivacyModule {}
