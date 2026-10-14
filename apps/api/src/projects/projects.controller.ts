import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser, SessionRequestUser } from '../auth/session-user.decorator';
import { Roles } from '../auth/roles.decorator';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  UpdateProjectDto,
} from './projects.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @CurrentUser() user: SessionRequestUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search = '',
  ) {
    return this.projects.list(user, Math.max(1, page), Math.min(Math.max(1, limit), 50), search);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: SessionRequestUser) {
    return this.projects.create(dto, user);
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @CurrentUser() user: SessionRequestUser,
    @Query('taskPage', new DefaultValuePipe(1), ParseIntPipe) taskPage: number,
  ) {
    return this.projects.get(id, user, Math.max(1, taskPage));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: SessionRequestUser,
  ) {
    return this.projects.update(id, dto, user);
  }

  @Patch(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: SessionRequestUser) {
    return this.projects.archive(id, user);
  }

  @Post(':id/members')
  addMember(
    @Param('id') id: string,
    @Body() dto: AddProjectMemberDto,
    @CurrentUser() user: SessionRequestUser,
  ) {
    return this.projects.addMember(id, dto, user);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: SessionRequestUser,
  ) {
    return this.projects.removeMember(id, userId, user);
  }
}