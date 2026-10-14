import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityEntity,
  Prisma,
  ProjectMemberRole,
  ProjectStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionRequestUser } from '../auth/session-user.decorator';
import { ProjectAccessService } from './project-access.service';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  UpdateProjectDto,
} from './projects.dto';

const safeMember = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;
const projectTaskPageSize = 20;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  async list(user: SessionRequestUser, page = 1, limit = 20, search = '') {
    const where: Prisma.ProjectWhereInput = {
      archivedAt: null,
      ...(user.role === UserRole.ADMIN
        ? {}
        : { members: { some: { userId: user.id } } }),
      ...(search
        ? { name: { contains: search.trim() } }
        : {}),
    };
    const [projects, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { tasks: true } },
          members: { include: { user: { select: safeMember } } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);
    const completedByProject = projects.length
      ? await this.prisma.task.groupBy({
          by: ['projectId'],
          where: {
            projectId: { in: projects.map((project) => project.id) },
            status: 'DONE',
          },
          _count: { _all: true },
        })
      : [];
    const completedCounts = new Map(
      completedByProject.map((item) => [item.projectId, item._count._all]),
    );
    return {
      data: projects.map((project) => ({
        ...project,
        completionPercentage: project._count.tasks
          ? Math.round(((completedCounts.get(project.id) ?? 0) / project._count.tasks) * 100)
          : 0,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async create(dto: CreateProjectDto, user: SessionRequestUser) {
    this.validateDates(dto.startDate, dto.deadline);
    if (dto.name.trim().length < 3 || !dto.description.trim()) {
      throw new BadRequestException('Project name and description are required');
    }
    const memberIds = [...new Set([user.id, ...(dto.memberIds ?? [])])];
    const requestedUsers = await this.prisma.user.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, role: true },
    });
    if (requestedUsers.length !== memberIds.length) {
      throw new BadRequestException('One or more project members do not exist');
    }
    const managerId = user.id;
    const project = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.project.create({
        data: {
          name: dto.name.trim(),
          description: dto.description.trim(),
          startDate: new Date(dto.startDate),
          deadline: new Date(dto.deadline),
          status: dto.status ?? ProjectStatus.PLANNING,
          createdById: user.id,
          members: {
            create: memberIds.map((userId) => ({
              userId,
              role:
                userId === managerId
                  ? ProjectMemberRole.PROJECT_MANAGER
                  : ProjectMemberRole.MEMBER,
            })),
          },
        },
      });
      await transaction.activityLog.create({
        data: {
          entityType: ActivityEntity.PROJECT,
          entityId: created.id,
          projectId: created.id,
          actorId: user.id,
          action: 'project.created',
          detail: created.name,
        },
      });
      return created;
    });
    return this.get(project.id, user);
  }

  async get(id: string, user: SessionRequestUser, taskPage = 1) {
    await this.access.assertCanView(id, user);
    const [project, completedTasks] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id },
        include: {
          members: { include: { user: { select: safeMember } } },
          tasks: {
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
            skip: (taskPage - 1) * projectTaskPageSize,
            take: projectTaskPageSize,
            include: {
              assignee: { select: safeMember },
              _count: { select: { comments: true } },
            },
          },
          activities: {
            orderBy: { createdAt: 'desc' },
            take: 30,
            include: { actor: { select: safeMember } },
          },
          _count: { select: { tasks: true } },
        },
      }),
      this.prisma.task.count({ where: { projectId: id, status: 'DONE' } }),
    ]);
    if (!project) throw new NotFoundException('Project not found');
    const totalTasks = project._count.tasks;
    return {
      ...project,
      completionPercentage: totalTasks
        ? Math.round((completedTasks / totalTasks) * 100)
        : 0,
      taskStats: {
        total: totalTasks,
        completed: completedTasks,
        open: totalTasks - completedTasks,
      },
      taskPagination: {
        page: taskPage,
        limit: projectTaskPageSize,
        total: totalTasks,
        pages: Math.ceil(totalTasks / projectTaskPageSize),
      },
    };
  }

  async update(id: string, dto: UpdateProjectDto, user: SessionRequestUser) {
    const project = await this.access.assertCanManage(id, user);
    if (dto.name !== undefined && dto.name.trim().length < 3) {
      throw new BadRequestException('Project name must contain at least 3 characters');
    }
    if (dto.description !== undefined && !dto.description.trim()) {
      throw new BadRequestException('Project description cannot be empty');
    }
    const startDate = dto.startDate ?? project.startDate.toISOString();
    const deadline = dto.deadline ?? project.deadline.toISOString();
    this.validateDates(startDate, deadline);
    const data = {
      ...dto,
      ...(dto.name ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
      ...(dto.deadline ? { deadline: new Date(dto.deadline) } : {}),
    };
    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.project.update({ where: { id }, data });
      await transaction.activityLog.create({
        data: {
          entityType: ActivityEntity.PROJECT,
          entityId: id,
          projectId: id,
          actorId: user.id,
          action: 'project.updated',
          detail: Object.keys(dto).join(', '),
        },
      });
      return result;
    });
    return updated;
  }

  async archive(id: string, user: SessionRequestUser) {
    await this.access.assertCanManage(id, user);
    return this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      await transaction.activityLog.create({
        data: {
          entityType: ActivityEntity.PROJECT,
          entityId: id,
          projectId: id,
          actorId: user.id,
          action: 'project.archived',
        },
      });
      return project;
    });
  }

  async addMember(id: string, dto: AddProjectMemberDto, actor: SessionRequestUser) {
    await this.access.assertCanManage(id, actor);
    const target = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, name: true, role: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (
      dto.role === ProjectMemberRole.PROJECT_MANAGER &&
      (actor.role !== UserRole.ADMIN || target.role !== UserRole.PROJECT_MANAGER)
    ) {
      throw new BadRequestException('Only an admin can assign a project manager');
    }
    if (await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId: dto.userId } },
    })) {
      throw new ConflictException('User is already a project member');
    }
    return this.prisma.$transaction(async (transaction) => {
      const membership = await transaction.projectMember.create({
        data: {
          projectId: id,
          userId: dto.userId,
          role: dto.role ?? ProjectMemberRole.MEMBER,
        },
        include: { user: { select: safeMember } },
      });
      await transaction.activityLog.create({
        data: {
          entityType: ActivityEntity.PROJECT,
          entityId: id,
          projectId: id,
          actorId: actor.id,
          action: 'project.member_added',
          detail: target.name,
        },
      });
      return membership;
    });
  }

  async removeMember(id: string, memberId: string, actor: SessionRequestUser) {
    await this.access.assertCanManage(id, actor);
    if (memberId === actor.id) {
      throw new BadRequestException('You cannot remove yourself from the project');
    }
    const openTasks = await this.prisma.task.count({
      where: { projectId: id, assigneeId: memberId, status: { not: 'DONE' } },
    });
    if (openTasks) {
      throw new ConflictException('Reassign open tasks before removing this member');
    }
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId: memberId } },
      include: { user: { select: { name: true } } },
    });
    if (!membership) throw new NotFoundException('Project member not found');
    if (membership.role === ProjectMemberRole.PROJECT_MANAGER) {
      const managers = await this.prisma.projectMember.count({
        where: { projectId: id, role: ProjectMemberRole.PROJECT_MANAGER },
      });
      if (managers <= 1) {
        throw new ConflictException('A project must retain at least one manager');
      }
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.projectMember.delete({
        where: { projectId_userId: { projectId: id, userId: memberId } },
      });
      await transaction.activityLog.create({
        data: {
          entityType: ActivityEntity.PROJECT,
          entityId: id,
          projectId: id,
          actorId: actor.id,
          action: 'project.member_removed',
          detail: membership.user.name,
        },
      });
    });
    return { message: 'Project member removed' };
  }

  private validateDates(startDate: string, deadline: string) {
    const start = new Date(startDate);
    const end = new Date(deadline);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new BadRequestException('Project dates must be valid');
    }
    if (end < start) {
      throw new BadRequestException('Deadline must be on or after the start date');
    }
  }
}