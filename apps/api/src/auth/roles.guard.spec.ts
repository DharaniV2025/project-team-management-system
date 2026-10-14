import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const contextFor = (role: UserRole) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    }) as unknown as ExecutionContext;

  it('allows a matching role', () => {
    const guard = new RolesGuard({
      getAllAndOverride: () => [UserRole.ADMIN],
    } as unknown as Reflector);

    expect(guard.canActivate(contextFor(UserRole.ADMIN))).toBe(true);
  });

  it('rejects a user without the required role', () => {
    const guard = new RolesGuard({
      getAllAndOverride: () => [UserRole.ADMIN],
    } as unknown as Reflector);

    expect(() => guard.canActivate(contextFor(UserRole.TEAM_MEMBER))).toThrow(
      ForbiddenException,
    );
  });
});