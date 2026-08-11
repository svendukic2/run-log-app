import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { AccountService, type AccountResponse } from './account.service';
import { PutAccountDto } from './dto/put-account.dto';

// Served under the global 'api' prefix (main.ts): GET/PUT /api/account. One
// resource per account, so the routes carry no id - the owner comes from the
// token via the global JwtAuthGuard.
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<AccountResponse> {
    return this.account.get(user.id);
  }

  @Put()
  put(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PutAccountDto,
  ): Promise<AccountResponse> {
    return this.account.put(user.id, dto);
  }
}
