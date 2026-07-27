import { BaseRepository } from './base.repository';
import { Assignment } from '../models/Assignment.model';
import { IAssignment } from '../interfaces/IAssignment';

class AssignmentRepository extends BaseRepository<IAssignment> {
  constructor() {
    super(Assignment);
  }

  async findByIdWithPopulate(assignmentId: string): Promise<IAssignment | null> {
    return await this.model
      .findById(assignmentId)
      .populate('creator', 'name email avatar')
      .populate('submissions')
      .lean()
      .exec() as unknown as IAssignment | null;
  }

  async findRawById(assignmentId: string): Promise<IAssignment | null> {
    return await this.model.findById(assignmentId).exec();
  }

   async findRawByAssignmentId(assignmentId: string): Promise<IAssignment | null> {
    return await this.model.findOne({ assignmentId }).exec();
  }

  async findByAssignmentIdWithPopulate(assignmentId: string): Promise<IAssignment | null> {
    return await this.model
      .findOne({ assignmentId })
      .populate('creator', 'name email avatar')
      .populate('submissions')
      .lean()
      .exec() as unknown as IAssignment | null;
  }

  async findWithFilters(
    filter: any,
    skip: number,
    limit: number,
    sortField: string,
    sortDir: 1 | -1
  ): Promise<IAssignment[]> {
    return await this.model
      .find(filter)
      .populate('creator', 'name email avatar')
      .sort({ [sortField]: sortDir })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec() as unknown as IAssignment[];
  }

  async countByFilter(filter: any): Promise<number> {
    return await this.model.countDocuments(filter).exec();
  }

  async createAssignment(data: any): Promise<IAssignment> {
    return await this.model.create(data);
  }

  async save(assignment: IAssignment): Promise<IAssignment> {
    return await assignment.save();
  }
}

export default new AssignmentRepository();