import { request } from './request';

export const removeCompany = (id) => request(`/companies/${id}`, { method: 'DELETE' });
