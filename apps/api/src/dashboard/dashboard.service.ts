import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SessionRequestUser } from '../auth/session-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: SessionRequestUser) {
    const projectWhere = {
      archivedAt: null,
      ...(user.role === UserRole.ADMIN
        ? {}
        : { members: { some: { userId: user.id } } }),
    };
    const taskWhere = { project: projectWhere };
    const now = new Date();
    const [totalProjects, projectsByStatus, totalTasks, tasksByStatus, overdueTasks, myTasks, completedTasks] =
      await Promise.all([
        this.prisma.project.count({ where: projectWhere }),
        this.prisma.project.groupBy({
          by: ['status'],
          where: projectWhere,
          _count: { _all: true },
        }),
        this.prisma.task.count({ where: taskWhere }),
        this.prisma.task.groupBy({
          by: ['status'],
          where: taskWhere,
          _count: { _all: true },
        }),
        this.prisma.task.count({
          where: {
            ...taskWhere,
            status: { not: 'DONE' },
            dueDate: { lt: now },
          },
        }),
        this.prisma.task.count({
          where: { ...taskWhere, assigneeId: user.id },
        }),
        this.prisma.task.count({
          where: { ...taskWhere, status: 'DONE' },
        }),
      ]);

    const projectCounts = Object.fromEntries(
      projectsByStatus.map((item) => [item.status, item._count._all]),
    );
    const taskCounts = Object.fromEntries(
      tasksByStatus.map((item) => [item.status, item._count._all]),
    );
    return {
      projects: {
        total: totalProjects,
        active: projectCounts.ACTIVE ?? 0,
        completed: projectCounts.COMPLETED ?? 0,
        byStatus: projectCounts,
      },
      tasks: {
        total: totalTasks,
        overdue: overdueTasks,
        assignedToMe: myTasks,
        byStatus: {
          TODO: taskCounts.TODO ?? 0,
          IN_PROGRESS: taskCounts.IN_PROGRESS ?? 0,
          IN_REVIEW: taskCounts.IN_REVIEW ?? 0,
          DONE: taskCounts.DONE ?? 0,
        },
      },
      projectCompletionPercentage: totalTasks
        ? Math.round((completedTasks / totalTasks) * 100)
        : 0,
    };
  }
}