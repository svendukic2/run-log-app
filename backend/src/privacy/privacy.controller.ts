import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { PutPrivacyDto } from './dto/put-privacy.dto';
import { PrivacyService, type PrivacyResponse } from './privacy.service';

// Served under the global 'api' prefix (main.ts): GET/PUT /api/privacy.
// One resource per account, so the routes carry no id - the owner comes
// from the token via the global JwtAuthGuard. Bodies are validated by the
// app-wide ValidationPipe (APP_PIPE in AppModule).
//
// A separate resource from /api/profile on purpose: these are columns on
// the User row (they gate what other accounts see), while the profile is
// the Profile table, and folding them together would make one full-replace
// PUT able to rewrite both.
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<PrivacyResponse> {
    return this.privacy.get(user.id);
  }

  @Put()
  put(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PutPrivacyDto,
  ): Promise<PrivacyResponse> {
    return this.privacy.put(user.id, dto);
  }
}
