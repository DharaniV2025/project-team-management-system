import { Controller, Get } from '@nestjs/common';
import { CurrentUser, SessionRequestUser } from '../auth/session-user.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@CurrentUser() user: SessionRequestUser) {
    return this.dashboard.summary(user);
  }
}