import { Socket } from 'socket.io';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  data: {
    userId: string;
    email?: string;
    userName?: string;
  };
}
