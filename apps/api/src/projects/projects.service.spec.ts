import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SessionRequestUser } from '../auth/session-user.decorator';
import { ProjectAccessService } from './project-access.service';
import { CreateProjectDto } from './projects.dto';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  const user: SessionRequestUser = {
    id: 'manager-1',
    name: 'Avery Manager',
    email: 'avery@example.com',
    role: UserRole.PROJECT_MANAGER,
    tokenHash: 'hash',
    sessionId: 'session-1',
  };
  const project = {
    id: 'project-1',
    name: 'Launch plan',
    description: 'A coordinated launch',
    startDate: new Date('2026-11-01'),
    deadline: new Date('2026-12-01'),
    status: 'PLANNING',
    archivedAt: null,
    createdById: user.id,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [],
    tasks: [],
    activities: [],
    _count: { tasks: 0 },
  };
  let prisma: Record<string, any>;
  let access: { assertCanView: Mock };
  let service: ProjectsService;

  beforeEach(() => {
    prisma = {
      user: { findMany: vi.fn().mockResolvedValue([{ id: user.id, role: UserRole.PROJECT_MANAGER }]) },
      project: {
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn().mockResolvedValue(project),
        findUnique: vi.fn().mockResolvedValue(project),
      },
      task: {
        count: vi.fn().mockResolvedValue(1),
        groupBy: vi.fn().mockResolvedValue([]),
      },
      projectMember: {},
      activityLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (operation: unknown) =>
        Array.isArray(operation)
          ? Promise.all(operation)
          : (operation as (transaction: unknown) => unknown)(prisma),
      ),
    };
    access = { assertCanView: vi.fn().mockResolvedValue(project) };
    service = new ProjectsService(
      prisma as unknown as PrismaService,
      access as unknown as ProjectAccessService,
    );
  });

  it('creates a project with its creator as manager and records the event', async () => {
    await service.create(
      {
        name: ' Launch plan ',
        description: 'A coordinated launch',
        startDate: '2026-11-01',
        deadline: '2026-12-01',
        memberIds: [],
      },
      user,
    );

    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Launch plan',
          members: { create: [{ userId: user.id, role: 'PROJECT_MANAGER' }] },
        }),
      }),
    );
    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'project.created' }) }),
    );
  });

  it('rejects a deadline earlier than the start date', async () => {
    await expect(
      service.create(
        {
          name: 'Launch plan',
          description: 'A coordinated launch',
          startDate: '2026-12-01',
          deadline: '2026-11-01',
        },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('loads only one task page while keeping project-wide completion totals', async () => {
    prisma.project.findUnique.mockResolvedValue({
      ...project,
      tasks: [{ id: 'task-page-2', status: 'TODO' }],
      _count: { tasks: 25 },
    });
    prisma.task.count.mockResolvedValue(5);

    const result = await service.get(project.id, user, 2);

    expect(prisma.project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          tasks: expect.objectContaining({ skip: 20, take: 20 }),
        }),
      }),
    );
    expect(result.taskStats).toEqual({ total: 25, completed: 5, open: 20 });
    expect(result.taskPagination).toEqual({ page: 2, limit: 20, total: 25, pages: 2 });
    expect(result.completionPercentage).toBe(20);
  });

  it('calculates project list progress from grouped task counts, not fetched task rows', async () => {
    prisma.project.findMany.mockResolvedValue([
      { ...project, _count: { tasks: 4 }, members: [] },
    ]);
    prisma.project.count.mockResolvedValue(1);
    prisma.task.groupBy.mockResolvedValue([
      { projectId: project.id, _count: { _all: 1 } },
    ]);

    const result = await service.list(user, 1, 20);

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: { select: { tasks: true } },
        }),
      }),
    );
    expect(prisma.task.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['projectId'], where: expect.any(Object) }),
    );
    expect(result.data[0].completionPercentage).toBe(25);
  });

  it('validates required fields for task creation DTOs', async () => {
    const { CreateTaskDto } = await import('../tasks/tasks.dto');
    const errors = await validate(plainToInstance(CreateTaskDto, {}));
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['title', 'description', 'projectId', 'dueDate']),
    );
  });

  it('rejects null update values for non-nullable fields while allowing task unassignment', async () => {
    const { UpdateTaskDto } = await import('../tasks/tasks.dto');
    const { UpdateProjectDto } = await import('./projects.dto');
    const taskErrors = await validate(
      plainToInstance(UpdateTaskDto, { status: null, priority: null, dueDate: null }),
    );
    const projectErrors = await validate(
      plainToInstance(UpdateProjectDto, { status: null, deadline: null }),
    );
    const unassignErrors = await validate(
      plainToInstance(UpdateTaskDto, { assigneeId: null }),
    );

    expect(taskErrors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['status', 'priority', 'dueDate']),
    );
    expect(projectErrors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['status', 'deadline']),
    );
    expect(unassignErrors).toHaveLength(0);
  });
});