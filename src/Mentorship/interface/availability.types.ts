// src/types/availability.types.ts

export interface TimeSlotData {
  startTime: string;
  endTime: string;
  isBooked: boolean;
}

export interface DayAvailability {
  day: string;
  isAvailable: boolean;
  slots: TimeSlotData[];
}

export interface WeeklyAvailability {
  monday: DayAvailability;
  tuesday: DayAvailability;
  wednesday: DayAvailability;
  thursday: DayAvailability;
  friday: DayAvailability;
  saturday: DayAvailability;
  sunday: DayAvailability;
}

export interface AvailabilityPreferences {
  timezone: string;
  minimumNotice: number; // hours
  maximumAdvance: number; // days
  bufferTime: number; // minutes between sessions
  allowBackToBack: boolean;
}

export interface AvailabilityOverride {
  date: Date;
  isAvailable: boolean;
  reason?: string;
  slots?: TimeSlotData[];
}

export interface AvailabilityQuery {
  mentorId: string;
  startDate: Date;
  endDate: Date;
  sessionType?: string;
  duration?: number;
  timezone?: string;
}