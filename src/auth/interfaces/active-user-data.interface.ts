import { UserRole } from '../../users/user.entity';

export interface ActiveUserData {
  sub: number;
  email: string;
  role: UserRole;
}
