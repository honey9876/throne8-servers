import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { logger } from '@/shared/logger.util';


interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
}

interface ApiErrorResponse {
  success: boolean;
  message: string;
  errors?: any;
}

class ApiClient {
  private client: AxiosInstance;
  private serviceName: string;

  constructor(config: ApiClientConfig, serviceName: string = 'External Service') {
    this.serviceName = serviceName;
    
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config: any) => {
        logger.debug(`[${this.serviceName}] Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error: any) => {
        logger.error(`[${this.serviceName}] Request Error:`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: any) => {
        logger.debug(`[${this.serviceName}] Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error: AxiosError<ApiErrorResponse>) => {
        this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  private handleError(error: AxiosError<ApiErrorResponse>): void {
    if (error.response) {
      // Server responded with error status
      logger.error(`[${this.serviceName}] API Error:`, {
        status: error.response.status,
        data: error.response.data,
        url: error.config?.url,
      });
    } else if (error.request) {
      // Request made but no response
      logger.error(`[${this.serviceName}] No Response:`, {
        url: error.config?.url,
        message: error.message,
      });
    } else {
      // Error in request setup
      logger.error(`[${this.serviceName}] Request Setup Error:`, error.message);
    }
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.get(url, config);
      return response.data;
    } catch(error : any) {
      throw this.transformError(error as AxiosError<ApiErrorResponse>);
    }
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.post(url, data, config);
      return response.data;
    } catch(error : any) {
      throw this.transformError(error as AxiosError<ApiErrorResponse>);
    }
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.put(url, data, config);
      return response.data;
    } catch(error : any) {
      throw this.transformError(error as AxiosError<ApiErrorResponse>);
    }
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.patch(url, data, config);
      return response.data;
    } catch(error : any) {
      throw this.transformError(error as AxiosError<ApiErrorResponse>);
    }
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.delete(url, config);
      return response.data;
    } catch(error : any) {
      throw this.transformError(error as AxiosError<ApiErrorResponse>);
    }
  }

  private transformError(error: AxiosError<ApiErrorResponse>): Error {
    if (error.response) {
      const message = error.response.data?.message || `${this.serviceName} API Error`;
      const apiError = new Error(message);
      (apiError as any).status = error.response.status;
      (apiError as any).data = error.response.data;
      return apiError;
    }
    
    if (error.request) {
      return new Error(`${this.serviceName} is not responding`);
    }
    
    return new Error(error.message || `${this.serviceName} request failed`);
  }

  setAuthToken(token: string): void {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  removeAuthToken(): void {
    delete this.client.defaults.headers.common['Authorization'];
  }

  setHeader(key: string, value: string): void {
    this.client.defaults.headers.common[key] = value;
  }

  removeHeader(key: string): void {
    delete this.client.defaults.headers.common[key];
  }
}

export default ApiClient;