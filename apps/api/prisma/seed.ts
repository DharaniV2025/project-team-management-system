import 'dotenv/config';
import {
  ActivityEntity,
  Prisma,
  PrismaClient,
  ProjectMemberRole,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.includes('replace-with')) {
    throw new Error('Set ADMIN_EMAIL and a strong ADMIN_PASSWORD in apps/api/.env before seeding');
  }
  if (password.length < 12 || password.length > 72) {
    throw new Error('ADMIN_PASSWORD must contain 12 to 72 characters');
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (existingUser && existingUser.role !== UserRole.ADMIN) {
    throw new Error('ADMIN_EMAIL already belongs to a non-admin account; no user data was changed');
  }

  const admin = existingUser ?? await prisma.user.create({
    data: {
      name: process.env.ADMIN_NAME?.trim() || 'Workspace Admin',
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: UserRole.ADMIN,
    },
    select: { id: true, email: true, role: true },
  });
  console.info('Admin account verified');

  const existingProject = await prisma.project.findFirst({
    where: { name: 'Studio website refresh', createdById: admin.id },
    select: { id: true },
  });
  if (existingProject) return;

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 10);
  const deadline = new Date(today);
  deadline.setDate(deadline.getDate() + 20);
  const completedDueDate = new Date(today);
  completedDueDate.setDate(completedDueDate.getDate() - 2);
  const nextDueDate = new Date(today);
  nextDueDate.setDate(nextDueDate.getDate() + 2);
  const finalDueDate = new Date(today);
  finalDueDate.setDate(finalDueDate.getDate() + 10);

  await prisma.$transaction(async (transaction) => {
    const project = await transaction.project.create({
      data: {
        name: 'Studio website refresh',
        description: 'A clearer home for the studio portfolio, services, and new business enquiries.',
        startDate,
        deadline,
        status: ProjectStatus.ACTIVE,
        createdById: admin.id,
      },
    });
    await transaction.projectMember.create({
      data: {
        projectId: project.id,
        userId: admin.id,
        role: ProjectMemberRole.PROJECT_MANAGER,
      },
    });
    const completed = await transaction.task.create({
      data: {
        title: 'Inventory current pages',
        description: 'List the pages and content that need to move into the refreshed site.',
        projectId: project.id,
        createdById: admin.id,
        assigneeId: admin.id,
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.DONE,
        dueDate: completedDueDate,
      },
    });
    const inProgress = await transaction.task.create({
      data: {
        title: 'Confirm the new navigation',
        description: 'Review the proposed information architecture with the studio team.',
        projectId: project.id,
        createdById: admin.id,
        assigneeId: admin.id,
        priority: TaskPriority.HIGH,
        status: TaskStatus.IN_PROGRESS,
        dueDate: nextDueDate,
      },
    });
    const upcoming = await transaction.task.create({
      data: {
        title: 'Prepare the launch review',
        description: 'Gather the final content and QA checklist before launch.',
        projectId: project.id,
        createdById: admin.id,
        priority: TaskPriority.LOW,
        status: TaskStatus.TODO,
        dueDate: finalDueDate,
      },
    });
    await transaction.taskComment.create({
      data: {
        taskId: inProgress.id,
        authorId: admin.id,
        body: 'The first navigation pass is ready for a quick review.',
      },
    });
    await transaction.activityLog.createMany({
      data: [
        {
          entityType: ActivityEntity.PROJECT,
          entityId: project.id,
          projectId: project.id,
          actorId: admin.id,
          action: 'project.created',
          detail: project.name,
        },
        ...[
          [completed.id, 'task.created', completed.title],
          [inProgress.id, 'task.status_changed', 'TODO -> IN_PROGRESS'],
          [upcoming.id, 'task.created', upcoming.title],
        ].map(([taskId, action, detail]) => ({
          entityType: ActivityEntity.TASK,
          entityId: taskId,
          taskId,
          projectId: project.id,
          actorId: admin.id,
          action,
          detail,
        })),
      ],
    });
  });
  console.info('Sample project and tasks created');
}

main()
  .catch((error: unknown) => {
    const safeMessages = [
      'Set ADMIN_EMAIL and a strong ADMIN_PASSWORD in apps/api/.env before seeding',
      'ADMIN_PASSWORD must contain 12 to 72 characters',
      'ADMIN_EMAIL already belongs to a non-admin account; no user data was changed',
    ];
    if (error instanceof Error && safeMessages.includes(error.message)) {
      console.error(error.message);
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(`Database seed failed (${error.code}).`);
    } else {
      console.error('Seed failed. Check database connectivity and seed configuration.');
    }
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());