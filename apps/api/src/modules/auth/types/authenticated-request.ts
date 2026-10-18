import { Request } from 'express';
import type { Role } from '@student-portal/shared';

export interface AuthenticatedUser {
  _id: string;
  role: Role;
  name: string;
  email?: string;
  studentCode?: string;
  staffType?: string;
  username?: string;
  permissions: string[];
  mustChangePassword: boolean;
  tokenVersion: number;
}

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};
