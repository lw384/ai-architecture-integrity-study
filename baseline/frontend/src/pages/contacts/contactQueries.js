import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { contactApi } from '../../api/contactApi';

export const contactKeys = {
  all: ['contacts'],
  lists: () => [...contactKeys.all, 'list'],
  list: (companyId, query) => [...contactKeys.lists(), { companyId: companyId ?? 'all', query }],
  details: () => [...contactKeys.all, 'detail'],
  detail: (contactId) => [...contactKeys.details(), contactId],
};

export function useContactList(params = {}) {
  const { companyId, ...query } = params;
  return useQuery({
    queryKey: contactKeys.list(companyId, query),
    queryFn: () => contactApi.list(companyId, query),
  });
}

export function useContact(id) {
  return useQuery({
    queryKey: contactKeys.detail(id),
    queryFn: () => contactApi.get(id),
    enabled: Boolean(id),
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => contactApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
    },
  });
}

export function useUpdateContact(contactId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => contactApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(variables.id) });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => contactApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
    },
  });
}