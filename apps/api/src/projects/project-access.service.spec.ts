import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectMemberRole, UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionRequestUser } from '../auth/session-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from './project-access.service';

describe('ProjectAccessService', () => {
  const projectId = 'project-private';
  const member: SessionRequestUser = {
    id: 'member-1',
    name: 'Team Member',
    email: 'member@example.com',
    role: UserRole.TEAM_MEMBER,
    tokenHash: 'hash',
    sessionId: 'session-1',
  };
  const prisma = {
    project: { findFirst: vi.fn() },
    projectMember: { findFirst: vi.fn(), findUnique: vi.fn() },
  };
  const access = new ProjectAccessService(prisma as unknown as PrismaService);

  beforeEach(() => vi.clearAllMocks());

  it('hides a project from a user who is not a member', async () => {
    prisma.projectMember.findFirst.mockResolvedValue(null);

    await expect(access.assertCanView(projectId, member)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.projectMember.findFirst).toHaveBeenCalledWith({
      where: {
        projectId,
        userId: member.id,
        project: { archivedAt: null },
      },
      include: { project: true },
    });
  });

  it('does not grant manager access from a member-level project relation', async () => {
    prisma.projectMember.findFirst.mockResolvedValue({ project: { id: projectId } });
    prisma.projectMember.findUnique.mockResolvedValue({ role: ProjectMemberRole.MEMBER });

    await expect(
      access.assertCanManage(projectId, {
        ...member,
        role: UserRole.PROJECT_MANAGER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});