export enum Role {
  ADMIN = 'admin',
  MENTOR = 'mentor',
  MENTEE = 'mentee',
  USER = 'user',
}

export const ROLE_HIERARCHY = {
  [Role.ADMIN]: 4,
  [Role.MENTOR]: 3,
  [Role.MENTEE]: 2,
  [Role.USER]: 1,
};

export const ROLE_PERMISSIONS = {
  [Role.ADMIN]: [
    'manage:all',
    'view:all',
    'edit:all',
    'delete:all',
  ],
  [Role.MENTOR]: [
    'create:sessions',
    'edit:own-sessions',
    'view:sessions',
    'manage:availability',
    'respond:queries',
  ],
  [Role.MENTEE]: [
    'book:sessions',
    'view:mentors',
    'submit:reviews',
    'ask:queries',
  ],
  [Role.USER]: [
    'view:public',
  ],
};

export const hasPermission = (userRole: Role, requiredRole: Role): boolean => {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
};

export const canAccessResource = (
  userRole: Role,
  permission: string
): boolean => {
  return ROLE_PERMISSIONS[userRole]?.includes(permission) || false;
};
