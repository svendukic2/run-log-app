import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Not @Global on purpose: each feature module that talks to the database
// imports PrismaModule explicitly, which keeps the imports arrays a
// greppable record of who touches persistence.
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
