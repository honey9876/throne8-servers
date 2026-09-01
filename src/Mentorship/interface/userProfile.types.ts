// src/types/userProfile.types.ts
import { Domain } from '../../shared/constants/domains';

export interface UserCareerGoal {
  goal: string;
  targetRole?: string;
  targetCompany?: string;
  timeframe?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface UserSkill {
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  yearsOfExperience?: number;
}

export interface UserPreferences {
  preferredDomains: Domain[];
  budgetRange?: {
    min: number;
    max: number;
  };
  preferredSessionTypes: string[];
  timeAvailability?: string[];
  learningStyle?: 'structured' | 'flexible' | 'hands-on' | 'theoretical';
  communicationPreference?: 'direct' | 'supportive' | 'analytical';
}

export interface UserCareerHistory {
  currentRole?: string;
  currentCompany?: string;
  yearsOfExperience: number;
  industryExperience?: string[];
  careerStage: 'student' | 'entry-level' | 'mid-level' | 'senior' | 'executive';
}

export interface UserProfile {
  userId: string;
  goals: UserCareerGoal[];
  skills: UserSkill[];
  preferences: UserPreferences;
  careerHistory: UserCareerHistory;
  interests: string[];
  challenges?: string[];
  achievements?: string[];
}

export interface MatchPreferences {
  focusAreas: string[];
  urgency: 'immediate' | 'short-term' | 'long-term';
  specificNeeds?: string;
  avoidTopics?: string[];
}

export interface UserMatchProfile {
  profile: UserProfile;
  matchPreferences?: MatchPreferences;
}

// Helper type for partial user profiles
export type PartialUserProfile = Partial<UserProfile>;

// Type for user profile from User Service API
export interface UserServiceProfile {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  skills?: string[];
  interests?: string[];
  bio?: string;
  location?: string;
  careerGoals?: string[];
  currentRole?: string;
  yearsOfExperience?: number;
  preferredDomains?: Domain[];
}

// Conversion helper types
export interface ProfileConversionOptions {
  includeGoals?: boolean;
  includeSkills?: boolean;
  includePreferences?: boolean;
  includeHistory?: boolean;
}