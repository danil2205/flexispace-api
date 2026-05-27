import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  INestApplication,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import request from 'supertest';
import type { Server } from 'http';
import {
  AllExceptionsFilter,
  ErrorResponse,
} from '../src/common/filters/all-exceptions.filter';

@Controller('test-errors')
class TestErrorsController {
  @Get('http')
  throwHttp() {
    throw new HttpException('Custom HTTP error', HttpStatus.BAD_REQUEST);
  }

  @Get('http-object')
  throwHttpObject() {
    throw new HttpException(
      {
        message: ['validation error 1', 'validation error 2'],
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  @Get('unhandled')
  throwUnhandled() {
    throw new Error('Something went wrong');
  }
}

describe('AllExceptionsFilter (e2e)', () => {
  let app: INestApplication;
  let originalNodeEnv: string | undefined;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestErrorsController],
    }).compile();

    originalNodeEnv = process.env.NODE_ENV;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    app = moduleFixture.createNestApplication();
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));
    await app.init();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should format HttpException (string response) correctly', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/test-errors/http')
      .expect(HttpStatus.BAD_REQUEST);

    const body = response.body as ErrorResponse;

    expect(body.success).toBe(false);
    expect(body.status).toBe(HttpStatus.BAD_REQUEST);
    expect(body.error).toBe('HttpException');
    expect(body.timestamp).toBeDefined();
    expect(body.path).toBe('/test-errors/http');
    expect(body.method).toBe('GET');
    expect(body.message).toBe('Custom HTTP error');
    expect(body.errorDetails).toBeNull();
  });

  it('should format HttpException (object response) correctly', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/test-errors/http-object')
      .expect(HttpStatus.BAD_REQUEST);

    const body = response.body as ErrorResponse;

    expect(body.success).toBe(false);
    expect(body.status).toBe(HttpStatus.BAD_REQUEST);
    expect(body.error).toBe('Bad Request');
    expect(body.path).toBe('/test-errors/http-object');
    expect(body.method).toBe('GET');
    expect(body.message).toEqual(['validation error 1', 'validation error 2']);
  });

  it('should format unhandled Error correctly in development', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/test-errors/unhandled')
      .expect(HttpStatus.INTERNAL_SERVER_ERROR);

    const body = response.body as ErrorResponse;

    expect(body.success).toBe(false);
    expect(body.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.message).toBe('Something went wrong');
    expect(body.error).toBe('Internal Server Error');
    expect(body.path).toBe('/test-errors/unhandled');
    expect(body.method).toBe('GET');
    expect(body.errorDetails).toBeDefined();
    expect(typeof body.errorDetails).toBe('string');
  });

  it('should format unhandled Error correctly in production (no leak)', async () => {
    process.env.NODE_ENV = 'production';
    const response = await request(app.getHttpServer() as Server)
      .get('/test-errors/unhandled')
      .expect(HttpStatus.INTERNAL_SERVER_ERROR);

    const body = response.body as ErrorResponse;

    expect(body.success).toBe(false);
    expect(body.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.message).toBe('Internal server error');
    expect(body.error).toBe('Internal Server Error');
    expect(body.path).toBe('/test-errors/unhandled');
    expect(body.method).toBe('GET');
    expect(body.errorDetails).toBeNull();
  });
});
