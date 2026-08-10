import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // Reads backend/.env at startup and makes ConfigService available everywhere
    // without re-importing this module. Copy .env.example to .env to set values.
    // validateEnv fails the boot on a missing DATABASE_URL (required since
    // RUN-46) instead of letting the first database call explain it badly.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Database access (RUN-46). Imported here so PrismaService instantiates
    // and connects at boot (a wrong DATABASE_URL fails the startup, not the
    // first query). Feature modules that query the database import
    // PrismaModule themselves - it is deliberately not @Global.
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
