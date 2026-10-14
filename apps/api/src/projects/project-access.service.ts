import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectMemberRole, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionRequestUser } from '../auth/session-user.decorator';

@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanView(projectId: string, user: SessionRequestUser) {
    if (user.role === UserRole.ADMIN) {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, archivedAt: null },
      });
      if (!project) throw new NotFoundException('Project not found');
      return project;
    }
    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: user.id, project: { archivedAt: null } },
      include: { project: true },
    });
    if (!membership) throw new NotFoundException('Project not found');
    return membership.project;
  }

  async assertCanManage(projectId: string, user: SessionRequestUser) {
    const project = await this.assertCanView(projectId, user);
    if (user.role === UserRole.ADMIN) return project;
    if (user.role !== UserRole.PROJECT_MANAGER) {
      throw new ForbiddenException('Project manager access required');
    }
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    if (membership?.role !== ProjectMemberRole.PROJECT_MANAGER) {
      throw new ForbiddenException('Project manager access required');
    }
    return project;
  }
}