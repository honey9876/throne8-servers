// src/models/schemas/privacySchema.ts

import { z } from 'zod';

/**
 * Privacy and security validation schemas
 * Covers profile visibility, connection privacy, and data sharing settings
 */

/**
 * Visibility levels
 */
const VisibilityLevel = z.enum(['public', 'connections', 'private']);

/**
 * Privacy settings schemas
 */
export const PrivacySchemas = {
  /**
   * Profile visibility settings
   */
  profileVisibility: z.object({
    profile: VisibilityLevel.default('public'),
    email: VisibilityLevel.default('private'),
    phone: VisibilityLevel.default('private'),
    location: VisibilityLevel.default('connections'),
    experience: VisibilityLevel.default('public'),
    education: VisibilityLevel.default('public'),
    skills: VisibilityLevel.default('public'),
    connections: VisibilityLevel.default('connections'),
    followers: VisibilityLevel.default('connections'),
    activity: VisibilityLevel.default('connections')
  }),

  /**
   * Update profile visibility
   */
  updateProfileVisibility: z.object({
    field: z.enum([
      'profile',
      'email',
      'phone',
      'location',
      'experience',
      'education',
      'skills',
      'connections',
      'followers',
      'activity'
    ]),
    visibility: VisibilityLevel
  }),

  /**
   * Connection privacy settings
   */
  connectionPrivacy: z.object({
    showConnectionList: z.boolean().default(true),
    allowConnectionRequests: z.boolean().default(true),
    allowMessagesFromNonConnections: z.boolean().default(false),
    autoAcceptConnections: z.boolean().default(false),
    notifyOnConnectionRequest: z.boolean().default(true),
    notifyOnConnectionAccepted: z.boolean().default(true)
  }),

  /**
   * Update connection privacy
   */
  updateConnectionPrivacy: z.object({
    showConnectionList: z.boolean().optional(),
    allowConnectionRequests: z.boolean().optional(),
    allowMessagesFromNonConnections: z.boolean().optional(),
    autoAcceptConnections: z.boolean().optional(),
    notifyOnConnectionRequest: z.boolean().optional(),
    notifyOnConnectionAccepted: z.boolean().optional()
  }).refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one privacy setting must be provided' }
  ),

  /**
   * Search privacy settings
   */
  searchPrivacy: z.object({
    allowSearchByEmail: z.boolean().default(false),
    allowSearchByPhone: z.boolean().default(false),
    showInSearchResults: z.boolean().default(true),
    allowSearchEngineIndexing: z.boolean().default(true)
  }),

  /**
   * Activity privacy settings
   */
  activityPrivacy: z.object({
    showOnlineStatus: z.boolean().default(true),
    showLastSeen: z.boolean().default(true),
    showTypingIndicator: z.boolean().default(true),
    showReadReceipts: z.boolean().default(true),
    shareActivityFeed: z.boolean().default(true)
  }),

  /**
   * Data sharing settings
   */
  dataSharing: z.object({
    allowAnalytics: z.boolean().default(true),
    allowPersonalization: z.boolean().default(true),
    allowThirdPartySharing: z.boolean().default(false),
    allowMarketingEmails: z.boolean().default(false),
    allowProductUpdates: z.boolean().default(true)
  }),

  /**
   * Block settings
   */
  blockUser: z.object({
    userId: z.string().min(1),
    reason: z.enum([
      'spam',
      'harassment',
      'inappropriate',
      'unwanted_contact',
      'other'
    ]).optional(),
    reportToAdmin: z.boolean().default(false)
  }),

  /**
   * Report settings
   */
  reportUser: z.object({
    userId: z.string().min(1),
    reason: z.enum([
      'spam',
      'harassment',
      'fake_profile',
      'inappropriate_content',
      'impersonation',
      'scam',
      'other'
    ]),
    description: z.string().min(10).max(500).optional(),
    evidence: z.array(z.string().url()).max(5).optional()
  }),

  /**
   * Mute settings
   */
  muteUser: z.object({
    userId: z.string().min(1),
    duration: z.enum(['1h', '8h', '24h', '7d', '30d', 'forever']).default('forever')
  }),

  /**
   * Who can see settings
   */
  whoCanSee: z.object({
    profileViews: z.enum(['everyone', 'connections', 'nobody']).default('everyone'),
    posts: z.enum(['public', 'connections', 'nobody']).default('public'),
    comments: z.enum(['public', 'connections', 'nobody']).default('public'),
    likes: z.enum(['public', 'connections', 'nobody']).default('connections')
  }),

  /**
   * Who can contact settings
   */
  whoCanContact: z.object({
    sendConnectionRequest: z.enum(['everyone', 'second_degree', 'nobody']).default('everyone'),
    sendMessage: z.enum(['connections', 'everyone', 'nobody']).default('connections'),
    viewEmail: z.enum(['connections', 'nobody']).default('nobody'),
    viewPhone: z.enum(['connections', 'nobody']).default('nobody')
  }),

  /**
   * Notification preferences (privacy related)
   */
  notificationPrivacy: z.object({
    emailNotifications: z.boolean().default(true),
    pushNotifications: z.boolean().default(true),
    smsNotifications: z.boolean().default(false),
    marketingEmails: z.boolean().default(false),
    weeklyDigest: z.boolean().default(true)
  }),

  /**
   * Two-factor authentication
   */
  twoFactorAuth: z.object({
    enabled: z.boolean(),
    method: z.enum(['sms', 'email', 'authenticator']).optional()
  }),

  /**
   * Login alerts
   */
  loginAlerts: z.object({
    notifyNewDevice: z.boolean().default(true),
    notifyNewLocation: z.boolean().default(true),
    notifyFailedAttempts: z.boolean().default(true)
  }),

  /**
   * Data download request
   */
  dataDownloadRequest: z.object({
    includeProfile: z.boolean().default(true),
    includeConnections: z.boolean().default(true),
    includeMessages: z.boolean().default(true),
    includeActivity: z.boolean().default(true),
    format: z.enum(['json', 'csv']).default('json')
  }),

  /**
   * Account deletion request
   */
  accountDeletion: z.object({
    reason: z.enum([
      'not_useful',
      'privacy_concerns',
      'too_busy',
      'found_alternative',
      'other'
    ]).optional(),
    feedback: z.string().max(500).optional(),
    deleteImmediately: z.boolean().default(false) // false = 30 day grace period
  })
};

/**
 * Complete privacy settings
 */
export const CompletePrivacySettings = z.object({
  profileVisibility: PrivacySchemas.profileVisibility,
  connectionPrivacy: PrivacySchemas.connectionPrivacy,
  searchPrivacy: PrivacySchemas.searchPrivacy,
  activityPrivacy: PrivacySchemas.activityPrivacy,
  dataSharing: PrivacySchemas.dataSharing,
  whoCanSee: PrivacySchemas.whoCanSee,
  whoCanContact: PrivacySchemas.whoCanContact,
  notificationPrivacy: PrivacySchemas.notificationPrivacy,
  twoFactorAuth: PrivacySchemas.twoFactorAuth,
  loginAlerts: PrivacySchemas.loginAlerts
});

/**
 * Bulk privacy update
 */
export const BulkPrivacyUpdate = z.object({
  profileVisibility: PrivacySchemas.profileVisibility.partial().optional(),
  connectionPrivacy: PrivacySchemas.connectionPrivacy.partial().optional(),
  searchPrivacy: PrivacySchemas.searchPrivacy.partial().optional(),
  activityPrivacy: PrivacySchemas.activityPrivacy.partial().optional(),
  dataSharing: PrivacySchemas.dataSharing.partial().optional()
}).refine(
  (data) => Object.values(data).some(v => v !== undefined),
  { message: 'At least one privacy setting must be provided' }
);

/**
 * Privacy preset profiles
 */
export const PrivacyPreset = z.enum(['public', 'semi_private', 'private']);

export const PrivacyPresets = {
  public: {
    profileVisibility: {
      profile: 'public',
      email: 'private',
      phone: 'private',
      location: 'public',
      experience: 'public',
      education: 'public',
      skills: 'public',
      connections: 'public',
      followers: 'public',
      activity: 'public'
    },
    searchPrivacy: {
      allowSearchByEmail: false,
      allowSearchByPhone: false,
      showInSearchResults: true,
      allowSearchEngineIndexing: true
    }
  },
  semi_private: {
    profileVisibility: {
      profile: 'public',
      email: 'private',
      phone: 'private',
      location: 'connections',
      experience: 'public',
      education: 'public',
      skills: 'public',
      connections: 'connections',
      followers: 'connections',
      activity: 'connections'
    },
    searchPrivacy: {
      allowSearchByEmail: false,
      allowSearchByPhone: false,
      showInSearchResults: true,
      allowSearchEngineIndexing: false
    }
  },
  private: {
    profileVisibility: {
      profile: 'connections',
      email: 'private',
      phone: 'private',
      location: 'private',
      experience: 'connections',
      education: 'connections',
      skills: 'connections',
      connections: 'private',
      followers: 'private',
      activity: 'private'
    },
    searchPrivacy: {
      allowSearchByEmail: false,
      allowSearchByPhone: false,
      showInSearchResults: false,
      allowSearchEngineIndexing: false
    }
  }
};

/**
 * Export all privacy schemas
 */
export default PrivacySchemas;