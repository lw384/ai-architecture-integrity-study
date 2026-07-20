import {
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';

import { companyApi } from '../../api/companyApi';

export const companyKeys = {
    all: ['companies'],
    lists: () => [...companyKeys.all, 'list'],
    list: (query) => [...companyKeys.lists(), query],
    details: () => [...companyKeys.all, 'detail'],
    detail: (id) => [...companyKeys.details(), id],
};

export function useCompanyList(query = {}) {
    return useQuery({
        queryKey: companyKeys.list(query),
        queryFn: () => companyApi.list(query),
    });
}

export function useCompany(id) {
    return useQuery({
        queryKey: companyKeys.detail(id),
        queryFn: () => companyApi.get(id),
        enabled: Boolean(id),
    });
}

export function useCreateCompany() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => companyApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: companyKeys.lists(),
            });
        },
    });
}

export function useUpdateCompany(companyId) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }) => companyApi.update(id, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: companyKeys.lists(companyId),
            });
            queryClient.invalidateQueries({
                queryKey: companyKeys.detail(variables.id),
            });
        },
    });
}

export function useDeleteCompany(companyId) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id) => companyApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: companyKeys.lists(companyId),
            });
        },
    });
}