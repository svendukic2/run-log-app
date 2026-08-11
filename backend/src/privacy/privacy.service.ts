import { Injectable, UnauthorizedException } from '@nestjs/common';
import { type PrivacySettings } from '../common/privacy';
import { isPrismaError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { PutPrivacyDto } from './dto/put-privacy.dto';

// The API shape is exactly PrivacySettings: three booleans, no ids, no
// wrapper. The owner is implicit in the token like every other resource
// since RUN-57.
export type PrivacyResponse = PrivacySettings;

// The columns this resource owns, in one place so the read and the write
// project the same thing (a select that drifts from the response type is
// how a password hash leaks).
const PRIVACY_SELECT = {
  profilePublic: true,
  showOnLeaderboard: true,
  showRoutes: true,
} as const;

@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  // No 404 case, unlike profile and goal: the settings are columns on the
  // User row, so a valid token always has them - they exist from signup at
  // the schema defaults (all false, private). A missing row means the
  // account was deleted mid-session, which is a dead session, not an empty
  // resource.
  async get(userId: string): Promise<PrivacyResponse> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PRIVACY_SELECT,
    });
    if (!row) throw new UnauthorizedException('Invalid or expired token');
    return row;
  }

  // Full replace, field by field rather than a dto spread: a spread would
  // silently widen this update into every column the DTO ever gains, and
  // this update writes to the User row, which also holds passwordHash and
  // email.
  //
  // Scoped by the primary key, which IS the owner scoping here: the WHERE
  // can only ever match the caller's own row, so there is no foreign-id
  // case to answer 404 for.
  async put(userId: string, dto: PutPrivacyDto): Promise<PrivacyResponse> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          profilePublic: dto.profilePublic,
          showOnLeaderboard: dto.showOnLeaderboard,
          showRoutes: dto.showRoutes,
        },
        select: PRIVACY_SELECT,
      });
    } catch (error) {
      // P2025 = no User row with that id: the token verified but its
      // account is gone. Same answer as any other dead session.
      if (isPrismaError(error, 'P2025')) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      throw error;
    }
  }
}
