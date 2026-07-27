import Package, {  PackageStatus } from '../models/Package';

class PackageRepository {

  async findByPackageId(packageId: string): Promise<any | null> {
    return await Package.findOne({ packageId: packageId });
  }

  async findById(objectId: string): Promise<any | null> {
    return await Package.findById(objectId);
  }

  async create(data: any): Promise<any> {
    const pkg = new Package(data);
    await pkg.save();
    return pkg;  // instance methods chahiye isliye lean nahi
  }

  async findByUserId(userId: string, status?: PackageStatus): Promise<any[]> {
    const query: any = { userId };
    if (status) query.status = status;
    return await Package.find(query).sort({ createdAt: -1 });
  }

  async updateByPackageId(packageId: string, updates: any): Promise<any | null> {
    const pkg = await Package.findOne({ packageId });
    if (!pkg) return null;
    Object.assign(pkg, updates);
    await pkg.save();
    return pkg;
  }

  async markExpired(): Promise<number> {
    const result = await Package.updateMany(
      { status: PackageStatus.ACTIVE, expiresAt: { $lt: new Date() } },
      { $set: { status: PackageStatus.EXPIRED } }
    );
    return result.modifiedCount || 0;
  }

  // repository mein add karo
async useSessionAtomic(packageId: string): Promise<any | null> {
  return await Package.findOneAndUpdate(
    { 
      packageId,                        // UUID se dhundho
      status: PackageStatus.ACTIVE, 
      remainingSessions: { $gt: 0 }    // check + update ek saath
    },
    { 
      $inc: { usedSessions: 1, remainingSessions: -1 },
      lastUsedAt: new Date()
    },
    { new: true }
  );
}

}

export default new PackageRepository();