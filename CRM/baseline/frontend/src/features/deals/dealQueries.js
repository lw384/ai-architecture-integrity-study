import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { dealApi } from './dealApi';

export const dealKeys = {
  byCustomer: (customerId) => ['deals', 'customer', customerId],
  detail: (dealId) => ['deals', 'detail', dealId],
};

export function useDealsByCustomerQuery(customerId) {
  return useQuery({
    queryKey: dealKeys.byCustomer(customerId),
    queryFn: () => dealApi.list(customerId),
    enabled: Boolean(customerId),
  });
}

export function useCreateDealMutation(customerId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => dealApi.create(customerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dealKeys.byCustomer(customerId),
      });
    },
  });
}

export function useUpdateDealMutation(customerId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => dealApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: dealKeys.byCustomer(customerId),
      });
      queryClient.invalidateQueries({
        queryKey: dealKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteDealMutation(customerId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: dealApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dealKeys.byCustomer(customerId),
      });
    },
  });
}