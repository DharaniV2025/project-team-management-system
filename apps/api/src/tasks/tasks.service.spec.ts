import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectMemberRole, TaskStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionRequestUser } from '../auth/session-user.decorator';
import { ProjectAccessService } from '../projects/project-access.service';
import { TaskListQueryDto, UpdateTaskDto } from './tasks.dto';
import { TasksService } from './tasks.service';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

describe('TasksService', () => {
  const member: SessionRequestUser = {
    id: 'member-1',
    name: 'Riley Member',
    email: 'riley@example.com',
    role: UserRole.TEAM_MEMBER,
    tokenHash: 'hash',
    sessionId: 'session-1',
  };
  const task = {
    id: 'task-1',
    title: 'Review onboarding',
    description: 'Walk through the flow',
    projectId: 'project-1',
    assigneeId: member.id,
    createdById: 'manager-1',
    priority: 'MEDIUM',
    status: TaskStatus.TODO,
    dueDate: new Date('2026-11-15'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let prisma: Record<string, any>;
  let projectAccess: { assertCanView: Mock; assertCanManage: Mock };
  let service: TasksService;

  beforeEach(() => {
    prisma = {
      task: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(12),
        create: vi.fn().mockResolvedValue(task),
        findUnique: vi.fn().mockResolvedValue(task),
        findUniqueOrThrow: vi.fn().mockResolvedValue(task),
        update: vi.fn().mockResolvedValue(task),
        delete: vi.fn().mockResolvedValue(task),
      },
      projectMember: {
        findUnique: vi.fn().mockResolvedValue({ role: ProjectMemberRole.MEMBER }),
      },
      activityLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (operation: unknown) =>
        Array.isArray(operation)
          ? Promise.all(operation)
          : (operation as (transaction: unknown) => unknown)(prisma),
      ),
    };
    projectAccess = {
      assertCanView: vi.fn().mockResolvedValue({ id: task.projectId }),
      assertCanManage: vi.fn().mockResolvedValue({ id: task.projectId }),
    };
    service = new TasksService(
      prisma as unknown as PrismaService,
      projectAccess as unknown as ProjectAccessService,
    );
  });

  it('filters and paginates tasks in the database', async () => {
    const query = Object.assign(new TaskListQueryDto(), {
      page: 2,
      limit: 5,
      projectId: task.projectId,
      status: TaskStatus.IN_PROGRESS,
      sortBy: 'dueDate' as const,
      sortOrder: 'desc' as const,
    });

    const result = await service.list(query, member);

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        orderBy: { dueDate: 'desc' },
        where: expect.objectContaining({
          projectId: task.projectId,
          status: TaskStatus.IN_PROGRESS,
        }),
      }),
    );
    expect(result.pagination).toEqual({ page: 2, limit: 5, total: 12, pages: 3 });
  });

  it('filters overdue tasks in the database and excludes completed tasks', async () => {
    const query = Object.assign(new TaskListQueryDto(), {
      overdue: 'true' as const,
      page: 1,
      limit: 20,
    });

    await service.list(query, member);

    const findMany = prisma.task.findMany.mock.calls[0][0];
    expect(findMany.where.dueDate.lt).toBeInstanceOf(Date);
    expect(findMany.where.AND).toEqual([{ status: { not: 'DONE' } }]);
  });

  it('creates a task in a managed project and writes its creation activity', async () => {
    const manager = { ...member, role: UserRole.PROJECT_MANAGER };
    await service.create(
      {
        title: task.title,
        description: task.description,
        projectId: task.projectId,
        assigneeId: null,
        dueDate: '2026-11-15',
      },
      manager,
    );

    expect(projectAccess.assertCanManage).toHaveBeenCalledWith(task.projectId, manager);
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: task.title,
          projectId: task.projectId,
          createdById: manager.id,
        }),
      }),
    );
    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'task.created' }) }),
    );
  });

  it('allows a member to change status on their assigned task and audits it', async () => {
    prisma.task.findUniqueOrThrow.mockResolvedValue({ ...task, status: TaskStatus.IN_PROGRESS });

    await service.update(task.id, { status: TaskStatus.IN_PROGRESS }, member);

    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: TaskStatus.IN_PROGRESS } }),
    );
    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'task.status_changed' }),
      }),
    );
  });

  it('allows only the defined status field on a transformed task patch DTO', async () => {
    prisma.task.findUniqueOrThrow.mockResolvedValue({ ...task, status: TaskStatus.IN_PROGRESS });
    const dto = Object.assign(
      {
        title: undefined,
        description: undefined,
        assigneeId: undefined,
        priority: undefined,
        dueDate: undefined,
      },
      { status: TaskStatus.IN_PROGRESS },
    ) as UpdateTaskDto;

    await service.update(task.id, dto, member);

    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: TaskStatus.IN_PROGRESS } }),
    );
  });

  it('rejects an empty patch with defined DTO property slots', async () => {
    const dto = Object.assign(new UpdateTaskDto(), {
      title: undefined,
      description: undefined,
      assigneeId: undefined,
      priority: undefined,
      status: undefined,
      dueDate: undefined,
    });

    await expect(service.update(task.id, dto, member)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('does not let a member edit someone else\'s task', async () => {
    prisma.task.findUnique.mockResolvedValue({ ...task, assigneeId: 'another-member' });

    await expect(
      service.update(task.id, { status: TaskStatus.IN_PROGRESS }, member),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('does not grant manager or member status capabilities without the matching access', async () => {
    const staleManager = { ...member, role: UserRole.PROJECT_MANAGER };
    prisma.projectMember.findUnique.mockResolvedValue({ role: ProjectMemberRole.MEMBER });
    prisma.task.findUniqueOrThrow.mockResolvedValue({ ...task, assigneeId: 'another-member' });

    const result = await service.get(task.id, staleManager);

    expect(result.permissions).toEqual({ canManage: false, canUpdateStatus: false });
  });

  it('lets an assigned project manager update only status when they are a regular project member', async () => {
    const projectManager = { ...member, role: UserRole.PROJECT_MANAGER };
    prisma.projectMember.findUnique.mockResolvedValue({ role: ProjectMemberRole.MEMBER });
    prisma.task.findUniqueOrThrow.mockResolvedValue({ ...task, status: TaskStatus.IN_PROGRESS });

    const result = await service.update(
      task.id,
      { status: TaskStatus.IN_PROGRESS },
      projectManager,
    );

    expect(result.permissions).toEqual({ canManage: false, canUpdateStatus: true });
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: TaskStatus.IN_PROGRESS } }),
    );
  });

  it('hides tasks from projects the current user cannot access', async () => {
    projectAccess.assertCanView.mockRejectedValue(new NotFoundException());

    await expect(service.get(task.id, member)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.task.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});