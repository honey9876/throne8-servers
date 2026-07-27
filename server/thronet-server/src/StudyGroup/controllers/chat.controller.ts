/**
 * ====================================
 * CHAT CONTROLLER
 * ====================================
 * Handles group chat operations
 */

import { Request, Response } from 'express';
import { asyncHandler } from '@/shared/utils/helpers.util';
import ResponseUtil from '@/shared/response.util';
import { NotFoundError, BadRequestError } from '@/shared/errors/app.error';
import {
  sendMessageSchema,
  editMessageSchema,
  reactToMessageSchema,
  getMessagesQuerySchema,
} from '../validators/chat.validator';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import chatService from '../services/chat.service';
import { messageRepository } from '../repositories';
import { logger } from '@/shared/logger.util';

/**
 * @desc    Send message in group
 * @route   POST /api/v1/chat/:groupId/send
 * @access  Private (Group Members Only)
 */
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const userId = (req as AuthRequest).user?.userId;

  const { error, value } = sendMessageSchema.validate(req.body);
  if (error) throw new BadRequestError(error.details[0]?.message || 'Validation failed');

  const { content, messageType, fileUrl, fileName, fileSize, replyTo } = value;

  const message = await chatService.sendMessage(
    groupId,
    userId!,
    content,
    messageType,
    fileUrl,
    fileName,
    fileSize,
    replyTo
  );

  logger.info("data from service while send message", message)

  return ResponseUtil.created(res, {data: message}, 'Message sent successfully');
});

/**
 * @desc    Get chat history of a group
 * @route   GET /api/v1/chat/:groupId/messages
 * @access  Private (Group Members Only)
 */
export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const userId = (req as AuthRequest).user?.userId;

  const { error, value } = getMessagesQuerySchema.validate(req.query);
  if (error) throw new BadRequestError(error.details[0]?.message || 'Validation failed');

  const { page, limit } = value;

  const result = await chatService.getGroupMessages(groupId, userId!, page, limit);

  return ResponseUtil.success(res, result, 'Messages fetched successfully');
});

/**
 * @desc    Edit message
 * @route   PUT /api/v1/chat/message/:messageId
 * @access  Private (Message Owner Only)
 */
export const editMessage = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const userId = (req as AuthRequest).user?.userId;

  const { error, value } = editMessageSchema.validate(req.body);
  if (error) throw new BadRequestError(error.details[0]?.message || 'Validation failed');

  const message = await chatService.editMessage(messageId, userId!, value.content);

  return ResponseUtil.success(res, message, 'Message updated successfully');
});

/**
 * @desc    Delete message
 * @route   DELETE /api/v1/chat/message/:messageId
 * @access  Private (Message Owner or Group Leader)
 */
export const deleteMessage = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const userId = (req as AuthRequest).user?.userId;

  // Need to check isLeader before calling service
  const message = await messageRepository.findRawById(messageId);
  if (!message) throw new NotFoundError('Message not found');

  const group = await chatService.getGroupForMessage(message.groupId);
  const isLeader = group?.leaderId === userId;

  await chatService.deleteMessage(messageId, userId!, isLeader);

  return ResponseUtil.success(res, null, 'Message deleted successfully');
});

/**
 * @desc    React to message
 * @route   POST /api/v1/chat/message/:messageId/react
 * @access  Private (Group Members Only)
 */
export const reactToMessage = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const userId = (req as AuthRequest).user?.userId;

  const { error, value } = reactToMessageSchema.validate(req.body);
  if (error) throw new BadRequestError(error.details[0]?.message || 'Validation failed');

  const message = await chatService.reactToMessage(messageId, userId!, value.emoji);

  return ResponseUtil.success(res, message, 'Reaction updated successfully');
});

/**
 * @desc    Pin/Unpin message
 * @route   PATCH /api/v1/chat/message/:messageId/pin
 * @access  Private (Group Leader Only)
 */
export const togglePinMessage = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const userId = (req as AuthRequest).user?.userId;

  // groupId chahiye service ko — message se lo
  const message = await messageRepository.findRawById(messageId);
  if (!message) throw new NotFoundError('Message not found');

  const updatedMessage = await chatService.pinMessage(messageId, message.groupId, userId!);

  return ResponseUtil.success(
    res,
    updatedMessage,
    updatedMessage?.isPinned ? 'Message pinned successfully' : 'Message unpinned successfully'
  );
});

/**
 * @desc    Get pinned messages
 * @route   GET /api/v1/chat/:groupId/pinned
 * @access  Private (Group Members Only)
 */
export const getPinnedMessages = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const userId = (req as AuthRequest).user?.userId;

  const messages = await chatService.getPinnedMessages(groupId, userId!);

  return ResponseUtil.success(res, messages, 'Pinned messages fetched successfully');
});

/**
 * @desc    Mark message as read
 * @route   PATCH /api/v1/chat/message/:messageId/read
 * @access  Private (Group Members Only)
 */
export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const userId = (req as AuthRequest).user?.userId;

  await chatService.markMessageAsRead(messageId, userId!);

  return ResponseUtil.success(res, null, 'Message marked as read');
});

/**
 * @desc    Get message read status
 * @route   GET /api/v1/chat/message/:messageId/read-status
 * @access  Private (Group Members Only)
 */
export const getReadStatus = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.params;

  const message = await messageRepository.findByIdWithPopulate(messageId);
  if (!message) throw new NotFoundError('Message not found');

  return ResponseUtil.success(res, {
    readCount: message.readBy.length,
    readBy: message.readBy,
  }, 'Read status fetched successfully');
});

/**
 * @desc    Search messages in group
 * @route   GET /api/v1/chat/:groupId/search
 * @access  Private (Group Members Only)
 */
export const searchMessages = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const userId = (req as AuthRequest).user?.userId;
  const { query, page = 1, limit = 20 } = req.query;

  if (!query || typeof query !== 'string') {
    throw new BadRequestError('Search query is required');
  }

  const result = await chatService.searchMessages(
    groupId,
    userId!,
    query,
    Number(page),
    Number(limit)
  );

  return ResponseUtil.success(res, result, 'Search results fetched successfully');
});

// /**
//  * ====================================
//  * CHAT CONTROLLER
//  * ====================================
//  * Handles group chat operations
//  */

// import { Request, Response } from 'express';
// import { asyncHandler } from '@/shared/utils/helpers.util';
// import ResponseUtil, { createPaginatedResponse } from '@/shared/response.util';
// import { NotFoundError, ForbiddenError, BadRequestError } from '@/shared/errors/app.error';
// import {
//   sendMessageSchema,
//   editMessageSchema,
//   reactToMessageSchema,
//   getMessagesQuerySchema,
// } from '../validators/chat.validator';
// import { MessageType } from '../enums';
// import { AuthRequest } from '@/shared/middlewares/auth.middleware';
// import { groupRepository, messageRepository } from '../repositories';

// /**
//  * @desc    Send message in group
//  * @route   POST /api/v1/chat/:groupId/send
//  * @access  Private (Group Members Only)
//  */
// export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
//   const { groupId } = req.params;
//   const userId = (req as AuthRequest).user?.id;

//   // Validate request body
//   const { error, value } = sendMessageSchema.validate(req.body);
//   if (error) {
//     throw new BadRequestError(error.details[0]?.message || 'Validation failed');
//   }

//   const { content, messageType, fileUrl, fileName, fileSize, replyTo } = value;

//   // Check if group exists
//   const group = await groupRepository.findByGroupId(groupId);

//   if (!group) {
//     throw new NotFoundError('Group not found');
//   }

//   // Check if replying to a valid message
//   if (replyTo) {
//     const replyMessage = await messageRepository.findById(replyTo);
//     if (!replyMessage || replyMessage.groupId !== groupId) {
//       throw new BadRequestError('Invalid reply message');
//     }
//   }

//   // Create message
//   // const message = await Message.create({
//   //   groupId,
//   //   sender: userId,
//   //   content,
//   //   messageType: messageType || MessageType.TEXT,
//   //   fileUrl,
//   //   fileName,
//   //   fileSize,
//   //   replyTo,
//   // });

//   const message = await messageRepository.createMessage({
//     groupId, sender: userId, content,
//     messageType: messageType || MessageType.TEXT,
//     fileUrl, fileName, fileSize, replyTo,
//   });

//   // Populate sender details
//   await message.populate('sender', 'fullName username avatar');
//   if (replyTo) {
//     await message.populate({
//       path: 'replyTo',
//       select: 'content sender',
//       populate: {
//         path: 'sender',
//         select: 'fullName username',
//       },
//     });
//   }

//   return ResponseUtil.created(res, message, 'Message sent successfully');
// });

// /**
//  * @desc    Get chat history of a group
//  * @route   GET /api/v1/chat/:groupId/messages
//  * @access  Private (Group Members Only)
//  */
// export const getMessages = asyncHandler(async (req: Request, res: Response) => {
//   const { groupId } = req.params;

//   // Validate query params
//   const { error, value } = getMessagesQuerySchema.validate(req.query);
//   if (error) {
//     throw new BadRequestError(error.details[0]?.message || 'Validation failed');
//   }

//   const { page, limit, before, after } = value;

//   // Build query
//   const query: any = {
//     groupId,
//     isDeleted: false,
//   };

//   if (before) {
//     query._id = { $lt: before };
//   }

//   if (after) {
//     query._id = { $gt: after };
//   }

//   // Count total messages
//   const total = await messageRepository.countMessages(query);

//   // Fetch messages with pagination
//   // const messages = await Message.find(query)
//   //   .sort({ createdAt: -1 })
//   //   .skip((page - 1) * limit)
//   //   .limit(limit)
//   //   .populate('sender', 'fullName username avatar')
//   //   .populate({
//   //     path: 'replyTo',
//   //     select: 'content sender',
//   //     populate: {
//   //       path: 'sender',
//   //       select: 'fullName username',
//   //     },
//   //   })
//   //   .lean();

//   const messages = await messageRepository.findMessages(query, page, limit);


//   // return createPaginatedResponse(
//   //   // res,
//   //   messages.reverse(), // Reverse to show oldest first
//   //   page,
//   //   limit,
//   //   total,
//   //   'Messages fetched successfully'
//   // );
//   return ResponseUtil.success(res, {
//     data: messages.reverse(),
//     pagination: {
//       page,
//       limit,
//       total,
//       totalPages: Math.ceil(total / limit),
//       hasNextPage: page < Math.ceil(total / limit),
//       hasPrevPage: page > 1,
//     }
//   }, 'Messages fetched successfully');
// });

// /**
//  * @desc    Edit message
//  * @route   PUT /api/v1/chat/message/:messageId
//  * @access  Private (Message Owner Only)
//  */
// export const editMessage = asyncHandler(async (req: Request, res: Response) => {
//   const { messageId } = req.params;
//   const userId = (req as AuthRequest).user?.id;

//   // Validate request body
//   const { error, value } = editMessageSchema.validate(req.body);
//   if (error) {
//     throw new BadRequestError(error.details[0]?.message || 'Validation failed');
//   }

//   const { content } = value;

//   // Find message
//   const message = await messageRepository.findRawById(messageId);
//   if (!message) {
//     throw new NotFoundError('Message not found');
//   }

//   // Check if user is the sender
//   if (message.sender.toString() !== userId) {
//     throw new ForbiddenError('You can only edit your own messages');
//   }

//   // Check if message is deleted
//   if (message.isDeleted) {
//     throw new BadRequestError('Cannot edit deleted message');
//   }

//   // Check if message can be edited (within 15 minutes)
//   const fifteenMinutes = 15 * 60 * 1000;
//   const timeSinceCreation = Date.now() - message.createdAt.getTime();
//   if (timeSinceCreation > fifteenMinutes) {
//     throw new ForbiddenError('Message can only be edited within 15 minutes');
//   }

//   // Save edit history
//   message.editHistory.push({
//     content: message.content,
//     editedAt: new Date(),
//   });

//   // Update message
//   message.content = content;
//   message.isEdited = true;
//   await message.save();

//   await message.populate('sender', 'fullName username avatar');

//   return ResponseUtil.success(res, message, 'Message updated successfully');
// });

// /**
//  * @desc    Delete message
//  * @route   DELETE /api/v1/chat/message/:messageId
//  * @access  Private (Message Owner or Group Leader)
//  */
// export const deleteMessage = asyncHandler(async (req: Request, res: Response) => {
//   const { messageId } = req.params;
//   const userId = (req as AuthRequest).user?.id;

//   // Find message
//   const message = await messageRepository.findRawById(messageId);
//   if (!message) {
//     throw new NotFoundError('Message not found');
//   }

//   const group = await groupRepository.findByGroupId(message.groupId);
//   if (!group) {
//     throw new NotFoundError('Group not found');
//   }

//   // Check if user is sender or group leader
//   const isSender = message.sender.toString() === userId;
//   const isLeader = group.leaderId === userId;

//   if (!isSender && !isLeader) {
//     throw new ForbiddenError('You can only delete your own messages or be a group leader');
//   }

//   // Soft delete
//   await messageRepository.softDelete(messageId, userId!);

//   return ResponseUtil.success(res, null, 'Message deleted successfully');
// });

// /**
//  * @desc    React to message
//  * @route   POST /api/v1/chat/message/:messageId/react
//  * @access  Private (Group Members Only)
//  */
// export const reactToMessage = asyncHandler(async (req: Request, res: Response) => {
//   const { messageId } = req.params;
//   const userId = (req as AuthRequest).user?.id;

//   const { error, value } = reactToMessageSchema.validate(req.body);
//   if (error) throw new BadRequestError(error.details[0]?.message || 'Validation failed');

//   const { emoji } = value;

//   // Raw message lo — save() karna hai
//   const message = await messageRepository.findRawById(messageId);
//   if (!message) throw new NotFoundError('Message not found');

//   // Existing reaction check karo
//   const existingReaction = message.reactions.find((r) => r.emoji === emoji);

//   if (existingReaction) {
//     const userIndex = existingReaction.users.findIndex(
//       (u) => u.toString() === userId
//     );
//     if (userIndex > -1) {
//       // Already react kiya — remove karo
//       existingReaction.users.splice(userIndex, 1);
//       if (existingReaction.users.length === 0) {
//         message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
//       }
//     } else {
//       // Naya user — add karo
//       existingReaction.users.push(userId as any);
//     }
//   } else {
//     // Naya emoji — add karo
//     message.reactions.push({ emoji, users: [userId as any] });
//   }

//   await message.save();
//   await message.populate('sender', 'fullName username avatar');

//   return ResponseUtil.success(res, message, 'Reaction updated successfully');
// });
// // export const reactToMessage = asyncHandler(async (req: Request, res: Response) => {
// //   const { messageId } = req.params;
// //   const userId = (req as AuthRequest).user?.id;

// //   // Validate request body
// //   const { error, value } = reactToMessageSchema.validate(req.body);
// //   if (error) {
// //     throw new BadRequestError(error.details[0]?.message || 'Validation failed');
// //   }

// //   const { emoji } = value;

// //   // Find message
// //   const message = await messageRepository.findRawById(messageId);
// //   if (!message) {
// //     throw new NotFoundError('Message not found');
// //   }

// //   // Check if reaction already exists
// //   const existingReaction = message.reactions.find((r) => r.emoji === emoji);

// //   if (existingReaction) {
// //     // Check if user already reacted
// //     const userIndex = existingReaction.users.findIndex(
// //       (u) => u.toString() === userId
// //     );

// //     if (userIndex > -1) {
// //       // Remove reaction
// //       existingReaction.users.splice(userIndex, 1);
// //       // Remove reaction if no users left
// //       if (existingReaction.users.length === 0) {
// //         message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
// //       }
// //     } else {
// //       // Add user to reaction
// //       existingReaction.users.push(userId as any);
// //     }
// //   } else {
// //     // Add new reaction
// //     message.reactions.push({
// //       emoji,
// //       users: [userId as any],
// //     });
// //   }

// //   await message.save();
// //   await message.populate('sender', 'fullName username avatar');

// //   return ResponseUtil.success(res, message, 'Reaction updated successfully');
// // });

// /**
//  * @desc    Pin/Unpin message
//  * @route   PATCH /api/v1/chat/message/:messageId/pin
//  * @access  Private (Group Leader Only)
//  */
// export const togglePinMessage = asyncHandler(async (req: Request, res: Response) => {
//   const { messageId } = req.params;
//   const userId = (req as AuthRequest).user?.id;

//   // Find message
//   const message = await messageRepository.findRawById(messageId);
//   if (!message) {
//     throw new NotFoundError('Message not found');
//   }

//   // Check if user is group leader
//   const group = await groupRepository.findByGroupId(message.groupId);
//   if (!group) {
//     throw new NotFoundError('Group not found');
//   }

//   if (group.leaderId !== userId) {
//     throw new ForbiddenError('Only group leader can pin messages');
//   }

//   // Check pinned messages count
//   if (!message.isPinned) {
//     const pinnedCount = await messageRepository.countPinnedMessages(message.groupId);


//     if (pinnedCount >= 5) {
//       throw new BadRequestError('Maximum 5 messages can be pinned per group');
//     }
//   }

//   // Toggle pin
//   // message.isPinned = !message.isPinned;
//   // await message.save();
//   await messageRepository.togglePin(messageId);
//   const updatedMessage = await messageRepository.findRawById(messageId);
//   await updatedMessage?.populate('sender', 'fullName username avatar');


//   return ResponseUtil.success(
//     res,
//     message,
//     message.isPinned ? 'Message pinned successfully' : 'Message unpinned successfully'
//   );
// });

// /**
//  * @desc    Get pinned messages
//  * @route   GET /api/v1/chat/:groupId/pinned
//  * @access  Private (Group Members Only)
//  */
// export const getPinnedMessages = asyncHandler(async (req: Request, res: Response) => {
//   const { groupId } = req.params;

//   const pinnedMessages = await messageRepository.findPinnedMessages(groupId);

//   return ResponseUtil.success(res, pinnedMessages, 'Pinned messages fetched successfully');
// });

// /**
//  * @desc    Mark message as read
//  * @route   PATCH /api/v1/chat/message/:messageId/read
//  * @access  Private (Group Members Only)
//  */
// export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
//   const { messageId } = req.params;
//   const userId = (req as AuthRequest).user?.id;

//   const message = await messageRepository.findRawById(messageId);
//   if (!message) {
//     throw new NotFoundError('Message not found');
//   }

//   // Add user to readBy if not already
//   // if (!message.readBy.includes(userId as any)) {
//   //   message.readBy.push(userId as any);
//   //   await message.save();
//   // }

//   // return ResponseUtil.success(res, null, 'Message marked as read');

//   await messageRepository.markAsRead(messageId, userId!);
//   return ResponseUtil.success(res, null, 'Message marked as read');
// });

// /**
//  * @desc    Get message read status
//  * @route   GET /api/v1/chat/message/:messageId/read-status
//  * @access  Private (Group Members Only)
//  */
// export const getReadStatus = asyncHandler(async (req: Request, res: Response) => {
//   const { messageId } = req.params;

//   const message = await messageRepository.findByIdWithPopulate(messageId);

//   if (!message) {
//     throw new NotFoundError('Message not found');
//   }

//   return ResponseUtil.success(
//     res,
//     {
//       readCount: message.readBy.length,
//       readBy: message.readBy,
//     },
//     'Read status fetched successfully'
//   );
// });

// /**
//  * @desc    Search messages in group
//  * @route   GET /api/v1/chat/:groupId/search
//  * @access  Private (Group Members Only)
//  */
// export const searchMessages = asyncHandler(async (req: Request, res: Response) => {
//   const { groupId } = req.params;
//   const { query, page = 1, limit = 20 } = req.query;

//   if (!query || typeof query !== 'string') {
//     throw new BadRequestError('Search query is required');
//   }

//   const searchQuery = {
//     groupId,
//     isDeleted: false,
//     content: { $regex: query, $options: 'i' },
//   };

//   const total = await messageRepository.countMessages(searchQuery);

//   // const messages = await Message.find(searchQuery)
//   //   .sort({ createdAt: -1 })
//   //   .skip((Number(page) - 1) * Number(limit))
//   //   .limit(Number(limit))
//   //   .populate('sender', 'fullName username avatar')
//   //   .lean();

//   const messages = await messageRepository.searchMessages(groupId, query, Number(page), Number(limit));

//   // return createPaginatedResponse(
//   //   // res,
//   //   messages,
//   //   total,
//   //   Number(page),
//   //   Number(limit),

//   //   'Search results fetched successfully'
//   // );
//   const pageNum = Number(page);
//   const limitNum = Number(limit);
//   return ResponseUtil.success(res, {
//     data: messages,
//     pagination: {
//       page: pageNum,
//       limit: limitNum,
//       total,
//       totalPages: Math.ceil(total / limitNum),
//       hasNextPage: pageNum < Math.ceil(total / limitNum),
//       hasPrevPage: pageNum > 1,
//     }
//   }, 'Search results fetched successfully');
// }) ;