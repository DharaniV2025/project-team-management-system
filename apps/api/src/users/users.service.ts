import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectMemberRole, UserRole } from '@prisma/client';
import { SessionRequestUser } from '../auth/session-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserRoleDto } from './users.dto';

const userFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(page = 1, limit = 20, search = '', user: SessionRequestUser) {
    const where = {
      ...(user.role === UserRole.PROJECT_MANAGER
        ? { role: UserRole.TEAM_MEMBER }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search.trim() } },
              { email: { contains: search.trim() } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          ...userFields,
          _count: { select: { memberships: true, assignedTasks: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async updateRole(
    id: string,
    dto: UpdateUserRoleDto,
    actor: SessionRequestUser,
  ) {
    if (id === actor.id) {
      throw new BadRequestException('You cannot change your own organization role');
    }
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('User not found');

    if (dto.role === UserRole.TEAM_MEMBER && target.role !== UserRole.TEAM_MEMBER) {
      const managedProjects = await this.prisma.projectMember.findMany({
        where: { userId: id, role: ProjectMemberRole.PROJECT_MANAGER },
        select: { projectId: true },
      });
      if (managedProjects.length) {
        const projectIds = managedProjects.map((membership) => membership.projectId);
        const otherManagers = await this.prisma.projectMember.findMany({
          where: {
            projectId: { in: projectIds },
            userId: { not: id },
            role: ProjectMemberRole.PROJECT_MANAGER,
          },
          select: { projectId: true },
        });
        const coveredProjects = new Set(otherManagers.map((membership) => membership.projectId));
        if (projectIds.some((projectId) => !coveredProjects.has(projectId))) {
          throw new ConflictException(
            'Assign another project manager before demoting this user',
          );
        }
      }
      return this.prisma.$transaction(async (transaction) => {
        await transaction.projectMember.updateMany({
          where: { userId: id, role: ProjectMemberRole.PROJECT_MANAGER },
          data: { role: ProjectMemberRole.MEMBER },
        });
        return transaction.user.update({
          where: { id },
          data: { role: dto.role },
          select: userFields,
        });
      });
    }

    return this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
      select: userFields,
    });
  }
}