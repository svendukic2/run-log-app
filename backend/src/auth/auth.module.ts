import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

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
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        // Seven days: long enough that the demo never logs anyone out
        // mid-sprint-review, short enough that a leaked token expires.
        // Refresh tokens are deliberately out of scope for RUN-56.
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  // Exported for the phase B guard task that will verify these tokens on
  // protected routes; nothing imports it yet.
  exports: [AuthService],
})
export class AuthModule {}
