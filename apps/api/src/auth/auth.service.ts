import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';

const publicUser = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.name.trim().length < 2) {
      throw new BadRequestException('Name must contain at least 2 characters');
    }
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('An account with this email already exists');
    }
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        passwordHash: await bcrypt.hash(dto.password, 12),
        role: UserRole.TEAM_MEMBER,
      },
      select: publicUser,
    });
    return this.createSession(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return this.createSession(safeUser);
  }

  async logout(tokenHash: string) {
    await this.prisma.authSession.deleteMany({ where: { tokenHash } });
    return { message: 'Logged out successfully' };
  }

  async createSession(user: {
    id: string;
    name: string;
    email: string;
    role: string;
  }) {
    const token = randomBytes(32).toString('base64url');
    const ttlHours = Number(this.config.get('SESSION_TTL_HOURS', '8'));
    if (!Number.isFinite(ttlHours) || ttlHours <= 0 || ttlHours > 720) {
      throw new Error('SESSION_TTL_HOURS must be between 1 and 720');
    }
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    await this.prisma.authSession.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt },
    });
    return { token, expiresAt, user };
  }

  static hashToken(token: string) {
    return hashToken(token);
  }
}