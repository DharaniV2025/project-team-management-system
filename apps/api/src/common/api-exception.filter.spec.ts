import { BadRequestException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiExceptionFilter } from './api-exception.filter';

describe('ApiExceptionFilter', () => {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  const request = { url: '/api/projects' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  };
  const filter = new ApiExceptionFilter();

  beforeEach(() => vi.clearAllMocks());

  it('keeps validation messages in the normalized 400 response', () => {
    filter.catch(new BadRequestException(['name is required']), host as never);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: ['name is required'],
        path: request.url,
      }),
    );
  });

  it('does not expose unexpected internal error messages', () => {
    filter.catch(new Error('private connection detail'), host as never);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred',
      }),
    );
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      'private connection detail',
    );
  });
});