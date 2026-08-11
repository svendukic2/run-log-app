import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { validateEnv } from './config/env.validation';
import { EventsModule } from './events/events.module';
import { FollowModule } from './follow/follow.module';
import { GoalModule } from './goal/goal.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { RunsModule } from './runs/runs.module';
import { WeekTargetsModule } from './week-targets/week-targets.module';

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
    RunsModule,
    AuthModule,
    EventsModule,
    FollowModule,
    ProfileModule,
    GoalModule,
    WeekTargetsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // App-wide request validation (RUN-47). Registered as a provider rather
    // than app.useGlobalPipes in main.ts so the e2e suite, which boots
    // AppModule directly, validates exactly like production - the global
    // 'api' prefix already has that split-brain problem and one is enough.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        // Unknown properties are stripped and reported, not silently kept:
        // the DTOs are the contract.
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    // Everything requires a Bearer token unless marked @Public() (RUN-57).
    // Registered app-wide, like the pipe above, so e2e suites booting
    // AppModule get exactly the production auth behavior. JwtService
    // resolves from AuthModule's exported JwtModule - same secret the
    // tokens were signed with.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
