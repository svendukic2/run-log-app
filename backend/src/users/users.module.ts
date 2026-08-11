import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// Feature module for reading other accounts (RUN-63's public profile;
// RUN-62's user search joins it next). PrismaModule is imported explicitly
// on purpose - see prisma.module.ts.
@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
