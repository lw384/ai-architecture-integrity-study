import { request } from './request';

export const companyApi = {
    list: () => request('/companies?status=active'),
    getOne: (id) => request(`/companies/${id}`),
    getKnown: () => request('/companies/company-1'),
    create: () => request('/companies', { method: 'POST', expectedStatus: 200 }),
};
