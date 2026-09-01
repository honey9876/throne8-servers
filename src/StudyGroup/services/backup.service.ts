/**
 * ====================================
 * BACKUP SERVICE
 * ====================================
 * Database backup and restore functionality
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import env from '@/config/env/env';
import awsService from '@/config/cache/aws.config';
import { LoggerUtil } from '@/shared/logger.util';

const execPromise = promisify(exec);

/**
 * Backup Configuration
 */
interface BackupConfig {
  dbUri: string;
  backupDir: string;
  uploadToS3: boolean;
  retentionDays: number;
}

/**
 * Backup Info Interface
 */
interface BackupInfo {
  name: string;
  path: string;
  size: string;
  createdAt: Date;
}

/**
 * Get backup configuration
 */
const getBackupConfig = (): BackupConfig => {
  return {
    dbUri: env.MONGODB_URI,
    backupDir: path.join(process.cwd(), 'backups'),
    // uploadToS3: isAWSConfigured(),
    uploadToS3: awsService.isAvailable(),
    retentionDays: 30, // Keep backups for 30 days
  };
};

/**
 * Ensure backup directory exists
 */
const ensureBackupDir = (backupDir: string): void => {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    LoggerUtil.info(`✅ Created backup directory: ${backupDir}`);
  }
};

/**
 * Generate backup filename
 */
const generateBackupFilename = (): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `backup-${timestamp}`;
};

/**
 * Create database backup
 */
export const createBackup = async (): Promise<{
  success: boolean;
  backupPath?: string;
  s3Path?: string;
  error?: string;
}> => {
  const config = getBackupConfig();
  const backupName = generateBackupFilename();
  const backupPath = path.join(config.backupDir, backupName);

  try {
    LoggerUtil.info('🔄 Starting database backup...');

    // Ensure backup directory exists
    ensureBackupDir(config.backupDir);

    // Create backup using mongodump
    const command = `mongodump --uri="${config.dbUri}" --out="${backupPath}" --gzip`;

    LoggerUtil.info('📦 Creating backup with mongodump...');
    const { stderr } = await execPromise(command);

    if (stderr && !stderr.includes('writing')) {
      LoggerUtil.warn('⚠️  Backup warning:', { stderr });
    }

    LoggerUtil.info(`✅ Backup created at: ${backupPath}`);

    // Compress backup folder (optional)
    const zipFilePath = `${backupPath}.zip`;
    await compressBackup(backupPath, zipFilePath);

    // Upload to S3 if configured
    let s3Path: string | undefined;
    if (config.uploadToS3) {
      s3Path = await uploadBackupToS3(zipFilePath, `${backupName}.zip`);
    }

    // Clean old backups
    await cleanOldBackups(config.backupDir, config.retentionDays);

    LoggerUtil.info('🎉 Backup completed successfully!');

    return {
      success: true,
      backupPath: zipFilePath,
      s3Path,
    };
  } catch (error: any) {
    LoggerUtil.error('❌ Backup failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Compress backup folder
 */
const compressBackup = async (
  backupPath: string,
  zipFilePath: string
): Promise<void> => {
  try {
    LoggerUtil.info('🗜️  Compressing backup...');

    // Using zip command (works on Unix/Linux/Mac)
    const command = `zip -r "${zipFilePath}" "${backupPath}"`;
    await execPromise(command);

    // Remove uncompressed folder
    fs.rmSync(backupPath, { recursive: true, force: true });

    LoggerUtil.info(`✅ Backup compressed: ${zipFilePath}`);
  } catch (error: any) {
    LoggerUtil.error('❌ Compression failed:', error);
    throw error;
  }
};

/**
 * Upload backup to S3
 */
const uploadBackupToS3 = async (
  filePath: string,
  fileName: string
): Promise<string> => {
  try {
    // const s3Client = getS3Client();
    // const bucket = getS3Bucket();

    // if (!s3Client || !bucket) {
    //   throw new Error('S3 not configured');
    // }

    // LoggerUtil.info('☁️  Uploading backup to S3...');

    // // Read file
    const fileContent = fs.readFileSync(filePath);

    // // Upload to S3
    // const key = `backups/${fileName}`;
    // await s3Client.send(
    //   new PutObjectCommand({
    //     Bucket: bucket,
    //     Key: key,
    //     Body: fileContent,
    //     ContentType: 'application/zip',
    //   })
    // );

    const uploadResult = await awsService.uploadFile(
      fileContent,
      fileName,
      { folder: 'backups', contentType: 'application/zip' }
    );

    const s3Path = uploadResult.url;
    LoggerUtil.info(`✅ Backup uploaded to S3: ${s3Path}`);

    return s3Path;
  } catch (error: any) {
    LoggerUtil.error('❌ S3 upload failed:', error);
    throw error;
  }
};

/**
 * Restore database from backup
 */
export const restoreBackup = async (
  backupPath: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    LoggerUtil.info('🔄 Starting database restore...');

    const config = getBackupConfig();

    // Check if backup file exists
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    // Uncompress if needed
    let restorePath = backupPath;
    if (backupPath.endsWith('.zip')) {
      LoggerUtil.info('📦 Uncompressing backup...');
      const unzipDir = backupPath.replace('.zip', '');
      await execPromise(`unzip "${backupPath}" -d "${unzipDir}"`);
      restorePath = unzipDir;
    }

    // Restore using mongorestore
    const command = `mongorestore --uri="${config.dbUri}" --gzip --drop "${restorePath}"`;

    LoggerUtil.info('📥 Restoring database...');
    const { stderr } = await execPromise(command);

    if (stderr && !stderr.includes('writing')) {
      LoggerUtil.warn('⚠️  Restore warning:', { stderr });
    }

    LoggerUtil.info('✅ Database restored successfully!');

    return { success: true };
  } catch (error: any) {
    LoggerUtil.error('❌ Restore failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Clean old backups
 */
const cleanOldBackups = async (
  backupDir: string,
  retentionDays: number
): Promise<void> => {
  try {
    LoggerUtil.info('🧹 Cleaning old backups...');

    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const maxAge = retentionDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds

    let deletedCount = 0;

    files.forEach((file) => {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age > maxAge) {
        fs.unlinkSync(filePath);
        deletedCount++;
        LoggerUtil.info(`🗑️  Deleted old backup: ${file}`);
      }
    });

    if (deletedCount > 0) {
      LoggerUtil.info(`✅ Cleaned ${deletedCount} old backup(s)`);
    } else {
      LoggerUtil.info('✅ No old backups to clean');
    }
  } catch (error: any) {
    LoggerUtil.error('❌ Error cleaning old backups:', error);
  }
};

/**
 * List all backups
 */
export const listBackups = async (): Promise<BackupInfo[]> => {
  try {
    const config = getBackupConfig();
    ensureBackupDir(config.backupDir);

    const files = fs.readdirSync(config.backupDir);

    const backups: BackupInfo[] = files
      .filter((file) => file.startsWith('backup-'))
      .map((file) => {
        const filePath = path.join(config.backupDir, file);
        const stats = fs.statSync(filePath);
        const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

        return {
          name: file,
          path: filePath,
          size: `${sizeInMB} MB`,
          createdAt: stats.mtime,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return backups;
  } catch (error: any) {
    LoggerUtil.error('❌ Error listing backups:', error);
    return [];
  }
};

/**
 * Schedule automatic backup (called from cron job)
 */
export const scheduleAutoBackup = async (): Promise<void> => {
  LoggerUtil.info('⏰ Running scheduled backup...');
  const result = await createBackup();

  if (result.success) {
    LoggerUtil.info('✅ Scheduled backup completed');
  } else {
    LoggerUtil.error('❌ Scheduled backup failed:', { error: result.error });
  }
};

export default {
  createBackup,
  restoreBackup,
  listBackups,
  scheduleAutoBackup,
};