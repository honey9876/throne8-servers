/**
 * ====================================
 * MESSAGE TYPE ENUM
 * ====================================
 * Defines different types of messages in chat
 */

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  VOICE = 'voice',
  VIDEO = 'video',
  SYSTEM = 'system',
}

export default MessageType;