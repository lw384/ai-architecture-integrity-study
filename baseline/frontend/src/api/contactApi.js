import { request } from './request';

export const contactApi = {
  list: (companyId, query) =>
    request('/contacts', {
      query: companyId ? { ...query, companyId } : query,
    }),
  create: (data) =>
    request('/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  get: (id) => request(`/contacts/${id}`),
  update: (id, data) =>
    request(`/contacts/${id}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: (id) =>
    request(`/contacts/${id}`, {
      method: 'DELETE',
    }),
};