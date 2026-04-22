import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { SignupDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
    private subscription: SubscriptionService,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const user = await this.users.create(dto);
    const token = this.signToken(user.id, user.role);

    return {
      access_token: token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, school: user.school },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account deactivated');
    }

    const token = this.signToken(user.id, user.role);

    return {
      access_token: token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, school: user.school },
    };
  }

  async getProfile(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    const plan = user.schoolId
      ? await this.subscription.getStatus(user.schoolId)
      : null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      school: user.school,
      subscription: plan,
    };
  }

  /** Issue a fresh token if the current user is still valid and active. */
  async refreshToken(userId: string, role: string) {
    const user = await this.users.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account deactivated or not found');
    }
    const token = this.signToken(user.id, user.role);
    return {
      access_token: token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, school: user.school },
    };
  }

  private signToken(userId: string, role: string): string {
    return this.jwt.sign({ sub: userId, role }, { expiresIn: '24h' });
  }
}
