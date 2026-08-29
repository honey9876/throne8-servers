
console.log('🟢 STEP-0: base.repository.ts file STARTED loading');/**
 * ====================================
 * BASE REPOSITORY (GENERIC) - FINAL FIXED VERSION
 * ====================================
 * Reusable repository pattern for all models
 * Type-safe, scalable, production-ready
 */

import { Document, Model, FilterQuery, UpdateQuery, QueryOptions, PopulateOptions } from 'mongoose';

export interface IRepository<T extends Document> {
  findById(id: string, populateOptions?: PopulateOptions | (string | PopulateOptions)[]): Promise<T | null>;
  findOne(filter: FilterQuery<T>, populateOptions?: PopulateOptions | (string | PopulateOptions)[]): Promise<T | null>;
  findMany(filter: FilterQuery<T>, options?: QueryOptions): Promise<T[]>;
  findAll(): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  createMany(data: Partial<T>[]): Promise<any[]>;
  update(id: string, data: UpdateQuery<T>): Promise<T | null>;
  updateMany(filter: FilterQuery<T>, data: UpdateQuery<T>): Promise<number>;
  delete(id: string): Promise<boolean>;
  deleteMany(filter: FilterQuery<T>): Promise<number>;
  count(filter?: FilterQuery<T>): Promise<number>;
  exists(filter: FilterQuery<T>): Promise<boolean>;
  paginate(filter: FilterQuery<T>, page: number, limit: number): Promise<{
    data: T[];
    total: number;
    page: number;
    pages: number;
  }>;
}

export class BaseRepository<T extends Document> implements IRepository<T> {
  constructor(protected model: Model<T>) {}

  /**
   * Find document by ID
   */
  async findById(id: string, populateOptions?: PopulateOptions | (string | PopulateOptions)[]): Promise<T | null> {
    try {
      const query = this.model.findById(id);
      
      if (populateOptions) {
        if (Array.isArray(populateOptions)) {
          populateOptions.forEach(pop => {
            if (typeof pop === 'string') {
              query.populate(pop);
            } else {
              query.populate(pop);
            }
          });
        } else {
          query.populate(populateOptions);
        }
      }
      
      return await query.exec();
    } catch (error : any) {
      throw new Error(`Error finding document by ID: ${error}`);
    }
  }

  /**
   * Find one document by filter
   */
  async findOne(filter: FilterQuery<T>, populateOptions?: PopulateOptions | (string | PopulateOptions)[]): Promise<T | null> {
    try {
      const query = this.model.findOne(filter);
      
      if (populateOptions) {
        if (Array.isArray(populateOptions)) {
          populateOptions.forEach(pop => {
            if (typeof pop === 'string') {
              query.populate(pop);
            } else {
              query.populate(pop);
            }
          });
        } else {
          query.populate(populateOptions);
        }
      }
      
      return await query.exec();
    } catch (error : any) {
      throw new Error(`Error finding document: ${error}`);
    }
  }

  /**
   * Find many documents by filter
   */
  async findMany(filter: FilterQuery<T>, options: QueryOptions = {}): Promise<T[]> {
    try {
      const query = this.model.find(filter);
      
      if (options.sort) query.sort(options.sort);
      if (options.limit) query.limit(options.limit);
      if (options.skip) query.skip(options.skip);
      
      // ✅ FIXED: Handle populate properly
      if (options.populate) {
        if (Array.isArray(options.populate)) {
          options.populate.forEach(pop => {
            if (typeof pop === 'string') {
              query.populate(pop);
            } else {
              query.populate(pop);
            }
          });
        } else if (typeof options.populate === 'string') {
          query.populate(options.populate);
        } else {
          query.populate(options.populate as PopulateOptions);
        }
      }
      
      const result = await query.exec();
      return result as T[];
    } catch (error : any) {
      throw new Error(`Error finding documents: ${error}`);
    }
  }

  /**
   * Find all documents
   */
  async findAll(): Promise<T[]> {
    try {
      const result = await this.model.find().exec();
      return result as T[];
    } catch (error : any) {
      throw new Error(`Error finding all documents: ${error}`);
    }
  }

  /**
   * Create a new document
   */
  async create(data: Partial<T>): Promise<T> {
    try {
      const document = new this.model(data);
      return await document.save();
    } catch (error : any) {
      throw new Error(`Error creating document: ${error}`);
    }
  }

  /**
   * Create multiple documents
   */
  async createMany(data: Partial<T>[]): Promise<any[]> {
    try {
      return await this.model.insertMany(data);
    } catch (error : any) {
      throw new Error(`Error creating multiple documents: ${error}`);
    }
  }

  /**
   * Update document by ID
   */
  async update(id: string, data: UpdateQuery<T>): Promise<T | null> {
    try {
      return await this.model
        .findByIdAndUpdate(id, data, { new: true, runValidators: true })
        .exec();
    } catch (error : any) {
      throw new Error(`Error updating document: ${error}`);
    }
  }

  /**
   * Update many documents
   */
  async updateMany(filter: FilterQuery<T>, data: UpdateQuery<T>): Promise<number> {
    try {
      const result = await this.model.updateMany(filter, data).exec();
      return result.modifiedCount;
    } catch (error : any) {
      throw new Error(`Error updating multiple documents: ${error}`);
    }
  }

  /**
   * Delete document by ID (hard delete)
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.model.findByIdAndDelete(id).exec();
      return result !== null;
    } catch (error : any) {
      throw new Error(`Error deleting document: ${error}`);
    }
  }

  /**
   * Delete many documents
   */
  async deleteMany(filter: FilterQuery<T>): Promise<number> {
    try {
      const result = await this.model.deleteMany(filter).exec();
      return result.deletedCount;
    } catch (error : any) {
      throw new Error(`Error deleting multiple documents: ${error}`);
    }
  }

  /**
   * Count documents
   */
  async count(filter: FilterQuery<T> = {}): Promise<number> {
    try {
      return await this.model.countDocuments(filter).exec();
    } catch (error : any) {
      throw new Error(`Error counting documents: ${error}`);
    }
  }

  /**
   * Check if document exists
   */
  async exists(filter: FilterQuery<T>): Promise<boolean> {
    try {
      const count = await this.model.countDocuments(filter).limit(1).exec();
      return count > 0;
    } catch (error : any) {
      throw new Error(`Error checking document existence: ${error}`);
    }
  }

  /**
   * Paginate results
   */
  async paginate(
    filter: FilterQuery<T>,
    page: number = 1,
    limit: number = 10
  ): Promise<{
    data: T[];
    total: number;
    page: number;
    pages: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      
      const [dataResult, total] = await Promise.all([
        this.model.find(filter).skip(skip).limit(limit).exec(),
        this.model.countDocuments(filter).exec(),
      ]);

      const data = dataResult as T[];

      return {
        data,
        total,
        page,
        pages: Math.ceil(total / limit),
      };
    } catch (error : any) {
      throw new Error(`Error paginating documents: ${error}`);
    }
  }
}