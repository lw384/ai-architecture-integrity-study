import { request } from '../../api/request';

export const contactApi = {
  list: (customerId) => request(`/customers/${customerId}/contacts`),
  create: (customerId, data) =>
    request(`/customers/${customerId}/contacts`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  get: (id) => request(`/contacts/${id}`),
  update: (id, data) =>
    request(`/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id) =>
    request(`/contacts/${id}`, {
      method: 'DELETE',
    }),
};