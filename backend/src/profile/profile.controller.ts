import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { PutProfileDto } from './dto/put-profile.dto';
import { ProfileService, type ProfileResponse } from './profile.service';

// Served under the global 'api' prefix (main.ts): GET/PUT /api/profile.
// One resource per account, so the routes carry no id - the owner comes
// from the token via the global JwtAuthGuard. Bodies are validated by the
// app-wide ValidationPipe (APP_PIPE in AppModule).
@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<ProfileResponse> {
    return this.profile.get(user.id);
  }

  // PUT, not PATCH: the onboarding and Settings forms always hold the whole
  // profile, so partial writes have no caller and full-replace keeps the
  // row impossible to half-update.
  @Put()
  put(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PutProfileDto,
  ): Promise<ProfileResponse> {
    return this.profile.put(user.id, dto);
  }
}
