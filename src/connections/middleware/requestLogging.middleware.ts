
// ===========================
// src/middleware/requestLogging.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

interface LogData {
  requestId: string;
  method: string;
  url: string;
  userAgent?: string;
  userId?: string;
  ip: string;
  timestamp: string;
  action: string;
  duration?: number;
  statusCode?: number;
  error?: any;
}

export const requestLogging = (action: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = uuidv4();
    const startTime = Date.now();

    // Add request ID to request object
    (req as any).requestId = requestId;

    const logData: LogData = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      timestamp: new Date().toISOString(),
      action
    };

    // Log request start
    console.log('Request started:', JSON.stringify(logData));

    // Override res.end to log completion
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: any) {
      const duration = Date.now() - startTime;
      
      const completionLog = {
        ...logData,
        duration,
        statusCode: res.statusCode,
        completed: new Date().toISOString()
      };

      console.log('Request completed:', JSON.stringify(completionLog));
      
      // Store in audit log if needed
      storeAuditLog(completionLog);

      return originalEnd.call(this, chunk, encoding);
    };

    // Log errors
    res.on('error', (error) => {
      const errorLog = {
        ...logData,
        duration: Date.now() - startTime,
        error: error.message,
        statusCode: res.statusCode,
        level: 'error'
      };

      console.error('Request error:', JSON.stringify(errorLog));
      storeAuditLog(errorLog);
    });

    next();
  };
};

// Store audit logs (implement based on your logging system)
const storeAuditLog = async (logData: any) => {
  try {
    // Implementation depends on your logging system
    // Could be database, file, external service, etc.
    
    // Example: Store in database
    // await AuditLog.create(logData);
    
    // Example: Send to external logging service
    // await loggingService.send(logData);
    
    console.log('Audit log stored:', logData.requestId);
  } catch (error : any) {
    console.error('Failed to store audit log:', error);
  }
};