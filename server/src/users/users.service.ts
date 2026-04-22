import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User } from './user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(data: {
    name: string;
    email: string;
    password: string;
    role?: string;
    school?: string;
    schoolId?: string;
  }): Promise<User> {
    const hashed = await bcrypt.hash(data.password, 12);
    return this.userModel.create({ ...data, password: hashed });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).select('+password').exec();
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async findBySchool(schoolId: string): Promise<User[]> {
    return this.userModel.find({ schoolId, isActive: true }).exec();
  }

  async updateRole(userId: string, role: string): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(userId, { role }, { new: true }).exec();
  }

  async deactivate(userId: string): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(userId, { isActive: false }, { new: true }).exec();
  }
}
