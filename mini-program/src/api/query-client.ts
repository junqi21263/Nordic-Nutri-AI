import { QueryClient } from "@tanstack/react-query";
import { mapQueryError } from "./query-error";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (failureCount, error) => {
        const mapped = mapQueryError(error);
        return mapped.retryable && failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
