import { request } from './request';

export const companyApi = {
    list: (query) => request('/companies', { query }),
    get: (id) => request(`/companies/${id}`),
    create: (data) =>
        request('/companies', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    update: (id, data) =>
        request(`/companies/${id}`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    delete: (id) =>
        request(`/companies/${id}`, {
            method: 'DELETE',
        }),
};