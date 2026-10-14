import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './auth.dto';

describe('AuthService', () => {
  const user = {
    id: 'user-1',
    name: 'Morgan Lee',
    email: 'morgan@example.com',
    role: UserRole.TEAM_MEMBER,
    passwordHash: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    authSession: { create: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      authSession: {
        create: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      { get: () => '8' } as unknown as ConfigService,
    );
  });

  it('creates a session for a valid password and never returns the hash', async () => {
    const passwordHash = await bcrypt.hash('A-strong-password-42', 4);
    prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash });

    const result = await service.login({
      email: ' MORGAN@example.com ',
      password: 'A-strong-password-42',
    });

    expect(result.token).toHaveLength(43);
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(prisma.authSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: user.id,
          tokenHash: expect.any(String),
        }),
      }),
    );
  });

  it('rejects an invalid password with a generic authentication error', async () => {
    const passwordHash = await bcrypt.hash('another-password', 4);
    prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash });

    await expect(
      service.login({ email: user.email, password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it('registers new accounts as team members and hashes their passwords', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data, select }) => ({
      id: user.id,
      name: data.name,
      email: data.email,
      role: UserRole.TEAM_MEMBER,
      createdAt: new Date(),
      ...(select ? {} : { passwordHash: data.passwordHash }),
    }));

    const result = await service.register({
      name: ' Morgan Lee ',
      email: ' MORGAN@example.com ',
      password: 'A-strong-password-42',
    });

    const createCall = prisma.user.create.mock.calls[0][0];
    expect(createCall.data.passwordHash).not.toBe('A-strong-password-42');
    expect(createCall.data.role).toBe(UserRole.TEAM_MEMBER);
    expect(result.user.email).toBe('morgan@example.com');
  });

  it('requires registration passwords to be at least 12 characters', async () => {
    const errors = await validate(
      plainToInstance(RegisterDto, {
        name: 'Morgan Lee',
        email: 'morgan@example.com',
        password: 'Short-pass9',
      }),
    );

    expect(errors.map((error) => error.property)).toContain('password');
  });

  it('invalidates the active session on logout', async () => {
    await service.logout('stored-token-hash');

    expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: 'stored-token-hash' },
    });
  });
});