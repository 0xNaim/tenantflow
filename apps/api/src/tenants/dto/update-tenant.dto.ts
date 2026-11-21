import { IsString, Length } from 'class-validator';

export class UpdateTenantDto {
  @IsString()
  @Length(2, 80)
  name!: string;
}
