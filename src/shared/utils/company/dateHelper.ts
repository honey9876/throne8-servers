/**
 * Date utility functions
 */

export const dateHelper = {
  // Get current timestamp
  now(): Date {
    return new Date();
  },

  // Format date to ISO string
  toISO(date: Date = new Date()): string {
    return date.toISOString();
  },

  // Add days to date
  addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  },

  // Add hours to date
  addHours(date: Date, hours: number): Date {
    const result = new Date(date);
    result.setHours(result.getHours() + hours);
    return result;
  },

  // Add minutes to date
  addMinutes(date: Date, minutes: number): Date {
    const result = new Date(date);
    result.setMinutes(result.getMinutes() + minutes);
    return result;
  },

  // Get start of day
  startOfDay(date: Date = new Date()): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  },

  // Get end of day
  endOfDay(date: Date = new Date()): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  },

  // Get start of month
  startOfMonth(date: Date = new Date()): Date {
    const result = new Date(date.getFullYear(), date.getMonth(), 1);
    return result;
  },

  // Get end of month
  endOfMonth(date: Date = new Date()): Date {
    const result = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    result.setHours(23, 59, 59, 999);
    return result;
  },

  // Calculate difference in days
  diffInDays(date1: Date, date2: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((date2.getTime() - date1.getTime()) / msPerDay);
  },

  // Calculate difference in hours
  diffInHours(date1: Date, date2: Date): number {
    const msPerHour = 60 * 60 * 1000;
    return Math.floor((date2.getTime() - date1.getTime()) / msPerHour);
  },

  // Check if date is past
  isPast(date: Date): boolean {
    return date.getTime() < new Date().getTime();
  },

  // Check if date is future
  isFuture(date: Date): boolean {
    return date.getTime() > new Date().getTime();
  },

  // Format date to readable string
  format(date: Date, format: string = 'YYYY-MM-DD'): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  },

  // Parse date from string
  parse(dateString: string): Date {
    return new Date(dateString);
  },

  // Get age from birthdate
  getAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age;
  },
};

export default dateHelper;