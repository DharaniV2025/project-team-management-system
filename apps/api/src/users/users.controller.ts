import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, SessionRequestUser } from '../auth/session-user.decorator';
import { UpdateUserRoleDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search = '',
    @CurrentUser() user: SessionRequestUser,
  ) {
    return this.users.list(
      Math.max(1, page),
      Math.min(Math.max(1, limit), 50),
      search,
      user,
    );
  }

  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() actor: SessionRequestUser,
  ) {
    return this.users.updateRole(id, dto, actor);
  }
}