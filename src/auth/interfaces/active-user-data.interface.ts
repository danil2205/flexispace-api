import { UserRole } from '../../users/enums/user-role.enum';

export interface ActiveUserData {
  sub: number;
  email: string;
  role: UserRole;
  isTwoFAuthenticated: boolean;
}
