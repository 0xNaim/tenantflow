import { IsString, Matches } from 'class-validator';

export class ConfirmTotpDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
