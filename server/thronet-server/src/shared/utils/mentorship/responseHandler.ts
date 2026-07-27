//utils /

import { Response } from 'express';

interface SuccessResponse {
  success: boolean;
  message: string;
  data?: any;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

interface ErrorResponse {
  success: boolean;
  message: string;
  errors?: any;
}

class ResponseHandler {
  /**
   * Send success response
   */
  static success(
    res: Response,
    message: string,
    data?: any,
    statusCode: number = 200,
    meta?: SuccessResponse['meta']
  ): Response {
    // Check if headers already sent
    if (res.headersSent) {
      return res;
    }

    const response: SuccessResponse = {
      success: true,
      message,
    };

    if (data !== undefined) {
      response.data = data;
    }

    if (meta) {
      response.meta = meta;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send error response
   */
  static error(
    res: Response,
    message: string,
    statusCode: number = 500,
    errors?: any
  ): Response {
    // Check if headers already sent
    if (res.headersSent) {
      return res;
    }

    const response: ErrorResponse = {
      success: false,
      message,
    };

    if (errors) {
      response.errors = errors;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send paginated response
   */
  static paginated(
    res: Response,
    message: string,
    data: any[],
    page: number,
    limit: number,
    total: number,
    statusCode: number = 200
  ): Response {
    const totalPages = Math.ceil(total / limit);

    return this.success(
      res,
      message,
      data,
      statusCode,
      {
        page,
        limit,
        total,
        totalPages,
      }
    );
  }

  /**
   * Send created response (201)
   */
  static created(res: Response, message: string, data?: any): void {
    res.status(201).json({
      success: true,
      message,
      data
    });
  }

  /**
   * Send no content response (204)
   */
  static noContent(res: Response): Response {
    if (res.headersSent) {
      return res;
    }
    return res.status(204).send();
  }

  /**
   * Send bad request response (400)
   */
  static badRequest(res: Response, message: string, errors?: any): Response {
    return this.error(res, message, 400, errors);
  }

  /**
   * Send unauthorized response (401)
   */
  static unauthorized(res: Response, message: string = 'Unauthorized'): Response {
    return this.error(res, message, 401);
  }

  /**
   * Send forbidden response (403)
   */
  static forbidden(res: Response, message: string = 'Forbidden'): Response {
    return this.error(res, message, 403);
  }

  /**
   * Send not found response (404)
   */
  static notFound(res: Response, message: string = 'Resource not found'): Response {
    return this.error(res, message, 404);
  }

  /**
   * Send conflict response (409)
   */
  static conflict(res: Response, message: string, errors?: any): Response {
    return this.error(res, message, 409, errors);
  }

  /**
   * Send internal server error response (500)
   */
  static serverError(res: Response, message: string = 'Internal server error'): Response {
    return this.error(res, message, 500);
  }
}

export default ResponseHandler;