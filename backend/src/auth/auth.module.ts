import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ACCESS_TOKEN_TTL_SECONDS } from './token-lifecycle';

// Feature module for accounts (RUN-56): signup and login issuing JWTs.
// PrismaModule is imported explicitly on purpose - see prisma.module.ts.
@Module({
  imports: [
    PrismaModule,
    // The secret comes from backend/.env via ConfigService (validateEnv has
    // already rejected a missing or placeholder value at boot, same
    // discipline as DATABASE_URL). registerAsync because ConfigService is
    // injected, not importable at decorator-evaluation time.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          // validateEnv already fails the boot for a missing variable; this
          // guard is for the other way in (a testing module or future
          // entrypoint wiring ConfigModule without validateEnv), where
          // JwtModule would otherwise accept undefined silently and fail
          // only at the first sign() as a 500. Same discipline as the
          // DATABASE_URL guard in PrismaService.
          throw new Error(
            'JWT_SECRET is not set. Copy backend/.env.example to backend/.env and generate one as the template describes.',
          );
        }
        return {
          secret,
          // Fifteen minutes since RUN-74, down from seven days. That is only
          // survivable because POST /api/auth/refresh now renews silently;
          // the reasoning, and the two windows that bound the renewing, live
          // in token-lifecycle.ts. Tokens signed before this change keep
          // their seven day expiry and keep working until it arrives.
          signOptions: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  // AuthService for the phase B guard task; JwtModule alongside it so that
  // guard can inject JwtService and VERIFY tokens against the same secret
  // and options they were signed with, instead of pasting a second
  // registerAsync into its own module and creating two sources of truth.
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
