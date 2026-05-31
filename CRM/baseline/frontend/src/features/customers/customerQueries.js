import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { customerApi } from './customerApi';

export const customerKeys = {
  all: ['customers'],
  lists: () => ['customers', 'list'],
  detail: (customerId) => ['customers', 'detail', customerId],
};

export function useCustomersQuery() {
  return useQuery({
    queryKey: customerKeys.lists(),
    queryFn: customerApi.list,
  });
}

export function useCustomerDetailQuery(customerId) {
  return useQuery({
    queryKey: customerKeys.detail(customerId),
    queryFn: () => customerApi.get(customerId),
    enabled: Boolean(customerId),
  });
}

export function useCreateCustomerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: customerApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
    },
  });
}

export function useUpdateCustomerMutation(customerId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => customerApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: customerKeys.detail(variables.id ?? customerId),
      });
    },
  });
}

export function useDeleteCustomerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: customerApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
    },
  });
}