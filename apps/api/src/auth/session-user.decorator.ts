import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface SessionRequestUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tokenHash: string;
  sessionId: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionRequestUser =>
    context.switchToHttp().getRequest<{ user: SessionRequestUser }>().user,
);