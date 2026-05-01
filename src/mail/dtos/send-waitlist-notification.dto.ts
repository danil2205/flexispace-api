import { Type } from 'class-transformer';
import { IsDate, IsEmail, IsString } from 'class-validator';

export class SendWaitlistNotificationDto {
  @IsEmail()
  email: string;

  @IsString()
  username: string;

  @IsString()
  workspaceTitle: string;

  @Type(() => Date)
  @IsDate()
  startTime: Date;

  @Type(() => Date)
  @IsDate()
  endTime: Date;
}
