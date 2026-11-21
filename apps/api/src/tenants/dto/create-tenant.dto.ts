import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(3, 60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must contain lowercase letters, numbers, and hyphens only',
  })
  slug?: string;
}
