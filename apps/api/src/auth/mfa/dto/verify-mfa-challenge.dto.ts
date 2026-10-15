import { IsIn, IsString, Matches } from 'class-validator';

export class VerifyMfaChallengeDto {
  @IsString()
  challengeToken!: string;

  @IsString()
  @IsIn(['totp', 'recovery'])
  method!: 'totp' | 'recovery';

  @IsString()
  @Matches(/^\d{6}$|^[A-Fa-f0-9]{16}$/)
  code!: string;
}
