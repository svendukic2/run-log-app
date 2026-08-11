import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { isPrismaError } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { PutAccountDto } from './dto/put-account.dto';

// The API shape of the account's identity: the User row's human-facing
// fields. This is the app's SINGLE source of truth for a runner's name and
// email (RUN-59) - every social surface already reads them from User
// (events, follow, notifications, leaderboards), and since RUN-59 the
// profile row no longer keeps its own copies to drift from. The password
// hash and the internal id stay out of the contract.
export interface AccountResponse {
  firstName: string;
  lastName: string;
  email: string;
}

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  // No 404 branch: the token was minted for this row, so a missing user
  // means the account was deleted mid-session, which is an authentication
  // problem and not a "resource not found" one.
  async get(userId: string): Promise<AccountResponse> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!row) throw new UnauthorizedException('Invalid or expired token');
    return row;
  }

  // The email is also the login credential, so changing it here changes
  // what the user types at Sign in. P2002 on the unique index means someone
  // else already owns that address: a 409 the form can explain, never a 500.
  async put(userId: string, dto: PutAccountDto): Promise<AccountResponse> {
    try {
      const row = await this.prisma.user.update({
        where: { id: userId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
        },
        select: { firstName: true, lastName: true, email: true },
      });
      return row;
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException('That email is already in use');
      }
      // P2025: the row vanished (deleted account) - same reasoning as get().
      if (isPrismaError(error, 'P2025')) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      throw error;
    }
  }
}
