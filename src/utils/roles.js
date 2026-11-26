// Role-based access control for SCREDTRES

export const OWNER_USERNAME = 'broknboyzclub';

export const ROLES = {
  ADMIN: 'admin',
  SUPPORT: 'support',
  USER: 'user'
};

export const normalizeUsername = (username) => {
  if (!username || typeof username !== 'string') return '';
  return username.replace(/^@/, '').trim().toLowerCase();
};

export const isLocalDevEnvironment = () => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  const hasRealTgInitData = Boolean(window.Telegram?.WebApp?.initData);
  return (host === 'localhost' || host === '127.0.0.1') && !hasRealTgInitData;
};

export const resolveUserRole = (tgUser, devRoleOverride = null, serverRole = null) => {
  if (isLocalDevEnvironment() && devRoleOverride) {
    return devRoleOverride;
  }

  if (serverRole === ROLES.ADMIN || serverRole === ROLES.SUPPORT || serverRole === ROLES.USER) {
    return serverRole;
  }

  const normalized = normalizeUsername(tgUser?.username);
  return normalized === OWNER_USERNAME ? ROLES.ADMIN : ROLES.USER;
};

export const getRoleLabel = (role) => {
  switch (role) {
    case ROLES.ADMIN:
      return 'Владелец';
    case ROLES.SUPPORT:
      return 'Поддержка приложения';
    default:
      return 'Покупатель';
  }
};

export const canManageProducts = (role) => role === ROLES.ADMIN || role === ROLES.SUPPORT;
export const canManageInfo = (role) => role === ROLES.ADMIN || role === ROLES.SUPPORT;
export const canManageOrders = (role) => role === ROLES.ADMIN || role === ROLES.SUPPORT;
export const canManageSettings = (role) => role === ROLES.ADMIN;
