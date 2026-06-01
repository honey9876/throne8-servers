/**
 * ====================================
 * DATE HELPER UTILITY
 * ====================================
 * Helper functions for date operations
 */

/**
 * Add days to a date
 */
export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * Add hours to a date
 */
export const addHours = (date: Date, hours: number): Date => {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
};

/**
 * Add minutes to a date
 */
export const addMinutes = (date: Date, minutes: number): Date => {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
};

/**
 * Check if a date has expired
 */
export const isExpired = (deadline: Date): boolean => {
  return new Date() > new Date(deadline);
};

/**
 * Check if a date is today
 */
export const isToday = (date: Date): boolean => {
  const today = new Date();
  const checkDate = new Date(date);
  
  return (
    today.getDate() === checkDate.getDate() &&
    today.getMonth() === checkDate.getMonth() &&
    today.getFullYear() === checkDate.getFullYear()
  );
};

/**
 * Get days remaining until deadline
 */
export const getDaysRemaining = (deadline: Date): number => {
  const now = new Date();
  const diff = new Date(deadline).getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

/**
 * Get hours remaining until deadline
 */
export const getHoursRemaining = (deadline: Date): number => {
  const now = new Date();
  const diff = new Date(deadline).getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60));
};

/**
 * Get minutes remaining until deadline
 */
export const getMinutesRemaining = (deadline: Date): number => {
  const now = new Date();
  const diff = new Date(deadline).getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60));
};

/**
 * Format date to YYYY-MM-DD
 */
export const formatDate = (date: Date): string => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Format date to DD/MM/YYYY
 */
export const formatDateDDMMYYYY = (date: Date): string => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}/${month}/${year}`;
};

/**
 * Format date to readable string
 */
export const formatReadableDate = (date: Date): string => {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return new Date(date).toLocaleDateString('en-US', options);
};

/**
 * Get start of day
 */
export const getStartOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Get end of day
 */
export const getEndOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

/**
 * Get start of week
 */
export const getStartOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
};

/**
 * Get end of week
 */
export const getEndOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() + (6 - day);
  return new Date(d.setDate(diff));
};

/**
 * Get start of month
 */
export const getStartOfMonth = (date: Date): Date => {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

/**
 * Get end of month
 */
export const getEndOfMonth = (date: Date): Date => {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
};

/**
 * Check if date is in the past
 */
export const isPast = (date: Date): boolean => {
  return new Date(date) < new Date();
};

/**
 * Check if date is in the future
 */
export const isFuture = (date: Date): boolean => {
  return new Date(date) > new Date();
};

/**
 * Get difference in days between two dates
 */
export const getDaysDifference = (date1: Date, date2: Date): number => {
  const diff = Math.abs(new Date(date1).getTime() - new Date(date2).getTime());
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

/**
 * Check if two dates are the same day
 */
export const isSameDay = (date1: Date, date2: Date): boolean => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  return (
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear()
  );
};

export default {
  addDays,
  addHours,
  addMinutes,
  isExpired,
  isToday,
  getDaysRemaining,
  getHoursRemaining,
  getMinutesRemaining,
  formatDate,
  formatDateDDMMYYYY,
  formatReadableDate,
  getStartOfDay,
  getEndOfDay,
  getStartOfWeek,
  getEndOfWeek,
  getStartOfMonth,
  getEndOfMonth,
  isPast,
  isFuture,
  getDaysDifference,
  isSameDay,
};