import { BaseRepository } from './base.repository';
import Assignment, { AssignmentSubmission } from '../models/Assignment.model';
import { IAssignmentSubmission } from '../interfaces/IAssignment';
import mongoose from 'mongoose';

class AssignmentSubmissionRepository extends BaseRepository<IAssignmentSubmission> {
  constructor() {
    super(AssignmentSubmission);
  }

  async findByIdAndAssignment(
    submissionId: string,
    assignmentId: string
  ): Promise<IAssignmentSubmission | null> {
    return await this.model
      .findOne({ _id: submissionId, assignment: assignmentId })
      .exec();
  }


  async createSubmission(data: any): Promise<IAssignmentSubmission> {
    return await this.model.create(data);
  }

  async findByAssignmentAndStudent(
    assignmentId: string,
    studentId: string
  ): Promise<IAssignmentSubmission | null> {
    return await this.model
      .findOne({ assignment: assignmentId, student: studentId })
      .exec();
  }

  async findByAssignmentIdsAndStudent(
    assignmentIds: string[],
    studentId: string
  ): Promise<IAssignmentSubmission[]> {
    return await this.model
      .find({
        assignment: { $in: assignmentIds },
        student: studentId,
      })
      .lean()
      .exec() as unknown as IAssignmentSubmission[];
  }

  async findBySubmissionIdAndAssignmentId(
    submissionId: string,
    assignmentId: string
  ): Promise<IAssignmentSubmission | null> {
    return await this.model
      .findOne({ submissionId, assignment: assignmentId })
      .exec();
  }

  async findWithFilters(
    filter: any,
    skip: number,
    limit: number,
    sortField: string,
    sortDir: 1 | -1
  ): Promise<IAssignmentSubmission[]> {
    return await this.model
      .find(filter)
      .populate('student', 'name email avatar')
      .populate('gradedBy', 'name email')
      .sort({ [sortField]: sortDir })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec() as unknown as IAssignmentSubmission[];
  }

  async countByFilter(filter: any): Promise<number> {
    return await this.model.countDocuments(filter).exec();
  }

  async findMySubmission(
    assignmentId: string,
    studentId: string
  ): Promise<IAssignmentSubmission | null> {
    return await this.model
      .findOne({ assignment: assignmentId, student: studentId })
      .populate('gradedBy', 'name email')
      .lean()
      .exec() as unknown as IAssignmentSubmission | null;
  }

  async getStatsByAssignmentId(assignmentId: string): Promise<any> {
    // assignmentId UUID hai — pehle _id nikalo aggregate ke liye
    const assignmentDoc = await Assignment.findOne({ assignmentId }).select('_id').lean();
    if (!assignmentDoc) return {};

    const [total, pending, graded, late, marksStats] = await Promise.all([
      this.model.countDocuments({ assignment: assignmentId }),
      this.model.countDocuments({ assignment: assignmentId, status: 'submitted' }),
      this.model.countDocuments({ assignment: assignmentId, status: 'graded' }),
      this.model.countDocuments({ assignment: assignmentId, isLate: true }),
      this.model.aggregate([
        {
          $match: {
            assignment: assignmentId,  // string field hai ab
            status: 'graded',
          },
        },
        {
          $group: {
            _id: null,
            averageMarks: { $avg: '$marksObtained' },
            highestMarks: { $max: '$marksObtained' },
            lowestMarks: { $min: '$marksObtained' },
          },
        },
      ]),
    ]);

    return {
      totalSubmissions: total,
      pendingGrading: pending,
      graded,
      lateSubmissions: late,
      averageMarks: marksStats[0]?.averageMarks || 0,
      highestMarks: marksStats[0]?.highestMarks || 0,
      lowestMarks: marksStats[0]?.lowestMarks || 0,
    };
  }

  async save(submission: IAssignmentSubmission): Promise<IAssignmentSubmission> {
    return await submission.save();
  }
}

export default new AssignmentSubmissionRepository();