import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthModule } from './auth.module';
import { UsersModule } from '../users/users.module';

describe('AuthService', () => {
  let service: AuthService;
  let module: TestingModule;
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ JWT_SECRET: 'test-secret-key-for-testing' })],
        }),
        MongooseModule.forRoot(uri),
        UsersModule,
        AuthModule,
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  const signupDto = {
    name: 'Dr. Sharma',
    email: 'sharma@school.edu.in',
    password: 'securePass123',
    school: 'DPS Patna',
  };

  it('should create a user via signup', async () => {
    const result = await service.signup(signupDto);
    expect(result).toHaveProperty('access_token');
    expect(result.user).toMatchObject({
      name: signupDto.name,
      email: signupDto.email,
    });
    expect(result.user).not.toHaveProperty('password');
  });

  it('should reject duplicate email', async () => {
    await expect(service.signup(signupDto)).rejects.toThrow(ConflictException);
  });

  it('should login with correct credentials', async () => {
    const result = await service.login({
      email: signupDto.email,
      password: signupDto.password,
    });
    expect(result).toHaveProperty('access_token');
    expect(result.user.email).toBe(signupDto.email);
  });

  it('should reject wrong password', async () => {
    await expect(
      service.login({ email: signupDto.email, password: 'wrongPassword' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject non-existent email', async () => {
    await expect(
      service.login({ email: 'nobody@test.com', password: 'anything' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
