import { request } from '../../api/request';

export const contactApi = {
  list: (companyId, query) =>
    request('/contacts', {
      query: companyId ? { ...query, companyId } : query,
    }),
  create: (companyId, data) =>
    request('/contacts', {
      method: 'POST',
      body: JSON.stringify({ ...data, companyId }),
    }),
  get: (id) => request(`/contacts/${id}`),
  update: (id, data) =>
    request(`/contacts/${id}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};