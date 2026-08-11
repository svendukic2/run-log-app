import { IsBoolean } from 'class-validator';

// PUT /api/privacy is a full replace, like the profile and goal PUTs: the
// Settings card always holds all three toggles, so every field is required
// and re-sending the same payload is a no-op. No @Transform coercion on
// purpose - a privacy setting must never be decided by "truthy": the
// string "false" arriving from a sloppy client would switch a toggle ON,
// which is the one direction that must never happen by accident. A
// non-boolean is a 400.
export class PutPrivacyDto {
  @IsBoolean({ message: 'profilePublic must be a boolean' })
  profilePublic!: boolean;

  @IsBoolean({ message: 'showOnLeaderboard must be a boolean' })
  showOnLeaderboard!: boolean;

  @IsBoolean({ message: 'showRoutes must be a boolean' })
  showRoutes!: boolean;
}
