import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser, SessionRequestUser } from '../auth/session-user.decorator';
import { Roles } from '../auth/roles.decorator';
import {
  CreateCommentDto,
  CreateTaskDto,
  TaskListQueryDto,
  UpdateTaskDto,
} from './tasks.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(
    @Query() query: TaskListQueryDto,
    @CurrentUser() user: SessionRequestUser,
  ) {
    return this.tasks.list(query, user);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: SessionRequestUser) {
    return this.tasks.create(dto, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: SessionRequestUser) {
    return this.tasks.get(id, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: SessionRequestUser,
  ) {
    return this.tasks.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: SessionRequestUser) {
    return this.tasks.remove(id, user);
  }

  @Get(':id/comments')
  comments(@Param('id') id: string, @CurrentUser() user: SessionRequestUser) {
    return this.tasks.comments(id, user);
  }

  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: SessionRequestUser,
  ) {
    return this.tasks.addComment(id, dto, user);
  }
}