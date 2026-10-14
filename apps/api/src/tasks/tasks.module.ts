import { Module } from '@nestjs/common';
import { ProjectAccessService } from '../projects/project-access.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, ProjectAccessService],
})
export class TasksModule {}