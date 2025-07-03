import { Middleware } from '@reduxjs/toolkit';

/**
 * Redux logger middleware for development
 * Logs all actions and state changes to the console
 */
export const loggerMiddleware: Middleware = (store) => (next) => (action) => {
  if (process.env.NODE_ENV === 'development' && typeof action === 'object' && action !== null && 'type' in action) {
    console.group((action as any).type);
    console.info('dispatching', action);
    const result = next(action);
    console.log('next state', store.getState());
    console.groupEnd();
    return result;
  }
  return next(action);
};