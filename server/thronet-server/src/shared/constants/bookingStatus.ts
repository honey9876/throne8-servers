export enum BookingStatus {
  AVAILABLE = 'available',
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  RESCHEDULED = 'rescheduled',
  NO_SHOW = 'no_show',
  REFUNDED = 'refunded',
}

export const BOOKING_STATUS_FLOW: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.AVAILABLE]: [BookingStatus.PENDING, BookingStatus.CANCELLED], 
  [BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]: [
    BookingStatus.IN_PROGRESS,
    BookingStatus.CANCELLED,
    BookingStatus.RESCHEDULED,
  ],
  [BookingStatus.IN_PROGRESS]: [BookingStatus.COMPLETED, BookingStatus.NO_SHOW],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [BookingStatus.REFUNDED],
  [BookingStatus.RESCHEDULED]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.NO_SHOW]: [],
  [BookingStatus.REFUNDED]: [],
};

export const CANCELLABLE_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
];

export const RESCHEDULABLE_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
];

export const REFUNDABLE_STATUSES: BookingStatus[] = [
  BookingStatus.CANCELLED,
];

export const FINAL_STATUSES: BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.NO_SHOW,
  BookingStatus.REFUNDED,
];

export const canTransitionTo = (
  currentStatus: BookingStatus,
  newStatus: BookingStatus
): boolean => {
  return BOOKING_STATUS_FLOW[currentStatus]?.includes(newStatus) || false;
};

export const isCancellable = (status: BookingStatus): boolean => {
  return CANCELLABLE_STATUSES.includes(status);
};

export const isReschedulable = (status: BookingStatus): boolean => {
  return RESCHEDULABLE_STATUSES.includes(status);
};

export const isFinalStatus = (status: BookingStatus): boolean => {
  return FINAL_STATUSES.includes(status);
};