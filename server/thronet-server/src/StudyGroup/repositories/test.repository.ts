import { BaseRepository } from './base.repository';
import Test from '../models/Test.model';
import { ITest } from '../interfaces/ITest';
import mongoose from 'mongoose';

class TestRepository extends BaseRepository<ITest> {
  constructor() {
    super(Test);
  }

  async findRawById(testId: string): Promise<ITest | null> {
    return await this.model.findById(testId).exec();
  }

  async findByIdWithPopulate(testId: string): Promise<ITest | null> {
    return await this.model
      .findById(testId)
      .populate('creator', 'name email avatar')
      .populate('questions')
      .lean()
      .exec() as unknown as ITest | null;
  }

  async findWithFilters(
    filter: any,
    skip: number,
    limit: number,
    sortField: string,
    sortDir: 1 | -1
  ): Promise<ITest[]> {
    return await this.model
      .find(filter)
      .populate('creator', 'name email avatar')
      .sort({ [sortField]: sortDir })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec() as unknown as ITest[];
  }

  async countByFilter(filter: any): Promise<number> {
    return await this.model.countDocuments(filter).exec();
  }

  async createTest(data: any): Promise<ITest> {
    return await this.model.create(data);
  }

  async save(test: ITest): Promise<ITest> {
    return await test.save();
  }

  async deleteById(testId: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(testId).exec();
    return result !== null;
  }
}

export default new TestRepository();