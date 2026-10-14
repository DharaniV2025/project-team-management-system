import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SessionRequestUser } from './session-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<
      Request & { user?: SessionRequestUser }
    >();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    if (!token || token.length > 128) {
      throw new UnauthorizedException('Authentication required');
    }

    const tokenHash = AuthService.hashToken(token);
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date()) {
      if (session) {
        await this.prisma.authSession.delete({ where: { id: session.id } });
      }
      throw new UnauthorizedException('Session expired or invalid');
    }

    const { user } = session;
    request.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tokenHash,
      sessionId: session.id,
    };
    return true;
  }
}