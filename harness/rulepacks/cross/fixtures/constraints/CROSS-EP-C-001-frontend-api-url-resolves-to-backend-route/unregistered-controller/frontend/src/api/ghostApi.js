import { request } from './request';

export const listGhosts = () => request('/ghosts');
