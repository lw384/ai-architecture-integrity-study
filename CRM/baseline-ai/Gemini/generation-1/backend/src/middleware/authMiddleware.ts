import { Request, Response, NextFunction } from 'express';
import { AuthUser, UserRole } from '../contact/contact.types';
import { AppError } from '../utils/appError';

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: AuthUser;
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as UserRole;

  if (!userId || !userRole || !Object.values(UserRole).includes(userRole)) {
    // For demonstration, default to ADMIN if no valid user headers are provided.
    // In a real application, this would typically throw a 401 Unauthorized error.
    req.authUser = { id: 'test-admin-id', role: UserRole.ADMIN };
    console.warn('Auth stub: No valid user headers provided (x-user-id, x-user-role), defaulting to ADMIN.');
  } else {
    req.authUser = { id: userId, role: userRole };
  }

  next();
};