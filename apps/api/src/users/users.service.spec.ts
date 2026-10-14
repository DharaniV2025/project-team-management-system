import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProjectMemberRole, UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionRequestUser } from '../auth/session-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService role updates', () => {
  const admin: SessionRequestUser = {
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    tokenHash: 'hash',
    sessionId: 'session-1',
  };
  const prisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    projectMember: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((callback: (transaction: unknown) => unknown) =>
      callback(prisma),
    ),
  };
  const service = new UsersService(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prevents an administrator from changing their own role', async () => {
    await expect(
      service.updateRole(admin.id, { role: UserRole.TEAM_MEMBER }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('prevents demotion when it would leave a project without a manager', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'manager-1', role: UserRole.PROJECT_MANAGER });
    prisma.projectMember.findMany
      .mockResolvedValueOnce([{ projectId: 'project-1' }])
      .mockResolvedValueOnce([]);

    await expect(
      service.updateRole('manager-1', { role: UserRole.TEAM_MEMBER }, admin),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('demotes project memberships when another manager can retain ownership', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'manager-1', role: UserRole.PROJECT_MANAGER });
    prisma.projectMember.findMany
      .mockResolvedValueOnce([{ projectId: 'project-1' }])
      .mockResolvedValueOnce([{ projectId: 'project-1' }]);
    prisma.projectMember.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({ id: 'manager-1', role: UserRole.TEAM_MEMBER });

    await service.updateRole('manager-1', { role: UserRole.TEAM_MEMBER }, admin);

    expect(prisma.projectMember.updateMany).toHaveBeenCalledWith({
      where: { userId: 'manager-1', role: ProjectMemberRole.PROJECT_MANAGER },
      data: { role: ProjectMemberRole.MEMBER },
    });
    expect(prisma.user.update).toHaveBeenCalled();
  });
});