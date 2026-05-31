import { request } from '../../api/request';

export const dealApi = {
  list: (customerId) => request(`/customers/${customerId}/deals`),
  create: (customerId, data) =>
    request(`/customers/${customerId}/deals`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  get: (id) => request(`/deals/${id}`),
  update: (id, data) =>
    request(`/deals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id) =>
    request(`/deals/${id}`, {
      method: 'DELETE',
    }),
};