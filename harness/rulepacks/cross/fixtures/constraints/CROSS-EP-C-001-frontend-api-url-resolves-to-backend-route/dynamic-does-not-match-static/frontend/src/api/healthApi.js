import { request } from './request';

export const getHealth = (state) => request(`/health/${state}`);
