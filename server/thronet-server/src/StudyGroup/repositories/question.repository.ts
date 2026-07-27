import { BaseRepository } from './base.repository';
import Question from '../models/Question.model';
import { IQuestion } from '../interfaces/IQuestion';
import mongoose from 'mongoose';

class QuestionRepository extends BaseRepository<IQuestion> {
    constructor() {
        super(Question);
    }

    async createQuestion(data: any): Promise<IQuestion> {
        return await this.model.create(data);
    }

    async findByIdAndTestId(questionId: string, testId: string): Promise<IQuestion | null> {
        return await this.model
            .findOne({ _id: questionId, test: testId })
            .exec();
    }

    async findByTestId(testId: string): Promise<IQuestion[]> {
        return await this.model
            .find({ test: testId })
            .sort({ order: 1 })
            .lean()
            .exec() as unknown as IQuestion[];
    }

    async deleteManyByTestId(testId: string): Promise<number> {
        const result = await this.model
            .deleteMany({ test: testId })
            .exec();
        return result.deletedCount;
    }

    async deleteById(questionId: string): Promise<boolean> {
        const result = await this.model.findByIdAndDelete(questionId).exec();
        return result !== null;
    }

    async save(question: IQuestion): Promise<IQuestion> {
        return await question.save();
    }

    async getStatsByTestId(testId: string): Promise<any[]> {
        return await this.model.aggregate([
            { $match: { test: new mongoose.Types.ObjectId(testId) } },
            {
                $group: {
                    _id: '$difficulty',
                    count: { $sum: 1 },
                    totalMarks: { $sum: '$marks' },
                },
            },
        ]);
    }
}

export default new QuestionRepository();