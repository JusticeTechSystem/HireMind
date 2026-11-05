import { AsyncLocalStorage } from 'async_hooks';
/** Carries the acting user into AI calls so usage/cost can be attributed without threading params everywhere. */
export const aiContext = new AsyncLocalStorage<{ userId?: string }>();
