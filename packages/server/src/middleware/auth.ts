import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export interface AuthPayload {
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      householdId?: string;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or invalid authorization header'));
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
    req.userId = payload.userId;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export async function requireHousehold(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    next(new UnauthorizedError());
    return;
  }

  try {
    const membership = await prisma.householdMember.findFirst({
      where: { userId: req.userId, acceptedAt: { not: null } },
      orderBy: { acceptedAt: 'desc' },
    });

    if (!membership) {
      next(new UnauthorizedError('You must belong to a household'));
      return;
    }

    req.householdId = membership.householdId;
    next();
  } catch (err) {
    next(err);
  }
}
