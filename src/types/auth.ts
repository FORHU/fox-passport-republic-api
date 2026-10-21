import { SystemRole, RoleType } from "@prisma/client";

/**
 * The verified caller attached to `req.user` by the `authenticate` middleware.
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  systemRole: SystemRole;
  roleType: RoleType[];
}
