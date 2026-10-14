import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityEntity,
  Prisma,
  ProjectMemberRole,
  UserRole,
} from '@prisma/client';
import { SessionRequestUser } from '../auth/session-user.decorator';
import { ProjectAccessService } from '../projects/project-access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCommentDto,
  CreateTaskDto,
  TaskListQueryDto,
  UpdateTaskDto,
} from './tasks.dto';

const safeUser = { id: true, name: true, email: true, role: true } as const;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async list(query: TaskListQueryDto, user: SessionRequestUser) {
    const where: Prisma.TaskWhereInput = {
      ...(user.role === UserRole.ADMIN
        ? { project: { archivedAt: null } }
        : { project: { archivedAt: null, members: { some: { userId: user.id } } } }),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.overdue === 'true'
        ? { dueDate: { lt: new Date() }, AND: [{ status: { not: 'DONE' } }] }
        : {}),
      ...(query.search
        ? { title: { contains: query.search.trim() } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          project: { select: { id: true, name: true, status: true } },
          assignee: { select: safeUser },
          _count: { select: { comments: true } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);
    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async create(dto: CreateTaskDto, user: SessionRequestUser) {
    await this.projectAccess.assertCanManage(dto.projectId, user);
    if (dto.title.trim().length < 3 || !dto.description.trim()) {
      throw new BadRequestException('Task title and description are required');
    }
    this.validateDate(dto.dueDate);
    const assignee = dto.assigneeId
      ? await this.assertMember(dto.projectId, dto.assigneeId)
      : null;
    const task = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.task.create({
        data: {
          title: dto.title.trim(),
          description: dto.description.trim(),
          projectId: dto.projectId,
          assigneeId: dto.assigneeId ?? null,
          createdById: user.id,
          priority: dto.priority,
          status: dto.status,
          dueDate: new Date(dto.dueDate),
        },
      });
      await transaction.activityLog.create({
        data: {
          entityType: ActivityEntity.TASK,
          entityId: created.id,
          taskId: created.id,
          projectId: created.projectId,
          actorId: user.id,
          action: 'task.created',
          detail: created.title,
        },
      });
      if (created.assigneeId) {
        await transaction.activityLog.create({
          data: {
            entityType: ActivityEntity.TASK,
            entityId: created.id,
            taskId: created.id,
            projectId: created.projectId,
            actorId: user.id,
            action: 'task.assigned',
            detail: assignee?.name,
          },
        });
      }
      return created;
    });
    return this.get(task.id, user);
  }

  async get(id: string, user: SessionRequestUser) {
    const task = await this.findAuthorizedTask(id, user);
    const [details, canManage] = await Promise.all([
      this.prisma.task.findUniqueOrThrow({
        where: { id: task.id },
        include: {
          project: { select: { id: true, name: true, status: true } },
          assignee: { select: safeUser },
          createdBy: { select: safeUser },
          comments: {
            orderBy: { createdAt: 'asc' },
            take: 100,
            include: { author: { select: safeUser } },
          },
          activities: {
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { actor: { select: safeUser } },
          },
        },
      }),
      this.isProjectManager(task.projectId, user),
    ]);
    return {
      ...details,
      permissions: {
        canManage,
        canUpdateStatus:
          canManage ||
          (user.role !== UserRole.ADMIN && details.assigneeId === user.id),
      },
    };
  }

  async update(id: string, dto: UpdateTaskDto, user: SessionRequestUser) {
    const task = await this.findAuthorizedTask(id, user);
    const isManager = await this.isProjectManager(task.projectId, user);
    const providedFields = Object.entries(dto)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    if (!providedFields.length) {
      throw new BadRequestException('At least one task field must be provided');
    }
    if (!isManager) {
      if (
        user.role === UserRole.ADMIN ||
        task.assigneeId !== user.id ||
        providedFields.length !== 1 ||
        providedFields[0] !== 'status'
      ) {
        throw new ForbiddenException('Members may only update status on their assigned tasks');
      }
    }
    if (dto.title !== undefined && dto.title.trim().length < 3) {
      throw new BadRequestException('Task title must contain at least 3 characters');
    }
    if (dto.description !== undefined && !dto.description.trim()) {
      throw new BadRequestException('Task description cannot be empty');
    }
    if (dto.dueDate) this.validateDate(dto.dueDate);
    const assignee = dto.assigneeId
      ? await this.assertMember(task.projectId, dto.assigneeId)
      : null;
    const definedFields = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    ) as UpdateTaskDto;
    const { assigneeId, ...taskFields } = definedFields;
    const updates: Prisma.TaskUpdateInput = {
      ...taskFields,
      ...(dto.title ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
      ...(assigneeId !== undefined
        ? { assignee: assigneeId !== null
            ? { connect: { id: assigneeId } }
            : { disconnect: true } }
        : {}),
    };
    const changedStatus = dto.status && dto.status !== task.status;
    const changedAssignee =
      assigneeId !== undefined && assigneeId !== task.assigneeId;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.task.update({ where: { id }, data: updates });
      if (changedStatus) {
        await transaction.activityLog.create({
          data: {
            entityType: ActivityEntity.TASK,
            entityId: id,
            taskId: id,
            projectId: task.projectId,
            actorId: user.id,
            action: 'task.status_changed',
            detail: `${task.status} -> ${dto.status}`,
          },
        });
      }
      if (changedAssignee) {
        await transaction.activityLog.create({
          data: {
            entityType: ActivityEntity.TASK,
            entityId: id,
            taskId: id,
            projectId: task.projectId,
            actorId: user.id,
            action: 'task.assigned',
            detail: assignee?.name ?? 'unassigned',
          },
        });
      }
    });
    return this.get(id, user);
  }

  async remove(id: string, user: SessionRequestUser) {
    const task = await this.findAuthorizedTask(id, user);
    await this.assertManager(task.projectId, user);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.activityLog.create({
        data: {
          entityType: ActivityEntity.TASK,
          entityId: id,
          taskId: id,
          projectId: task.projectId,
          actorId: user.id,
          action: 'task.deleted',
        },
      });
      await transaction.task.delete({ where: { id } });
    });
    return { message: 'Task deleted' };
  }

  async addComment(id: string, dto: CreateCommentDto, user: SessionRequestUser) {
    const task = await this.findAuthorizedTask(id, user);
    if (!dto.body.trim()) {
      throw new BadRequestException('Comment cannot be empty');
    }
    const comment = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.taskComment.create({
        data: { taskId: id, authorId: user.id, body: dto.body.trim() },
        include: { author: { select: safeUser } },
      });
      await transaction.activityLog.create({
        data: {
          entityType: ActivityEntity.TASK,
          entityId: id,
          taskId: id,
          projectId: task.projectId,
          actorId: user.id,
          action: 'task.comment_added',
        },
      });
      return created;
    });
    return comment;
  }

  async comments(id: string, user: SessionRequestUser) {
    await this.findAuthorizedTask(id, user);
    return this.prisma.taskComment.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { author: { select: safeUser } },
    });
  }

  private async findAuthorizedTask(id: string, user: SessionRequestUser) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: { id: true, projectId: true, assigneeId: true, status: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.projectAccess.assertCanView(task.projectId, user);
    return task;
  }

  private async isProjectManager(projectId: string, user: SessionRequestUser) {
    if (user.role === UserRole.ADMIN) return true;
    if (user.role !== UserRole.PROJECT_MANAGER) return false;
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    return membership?.role === ProjectMemberRole.PROJECT_MANAGER;
  }

  private async assertManager(projectId: string, user: SessionRequestUser) {
    if (!(await this.isProjectManager(projectId, user))) {
      throw new ForbiddenException('Project manager access required');
    }
  }

  private async assertMember(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!member) {
      throw new BadRequestException('Assignee must be a member of the project');
    }
    return member.user;
  }

  private validateDate(value: string) {
    if (!Number.isFinite(new Date(value).getTime())) {
      throw new BadRequestException('Due date must be valid');
    }
  }
}