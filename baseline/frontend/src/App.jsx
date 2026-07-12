import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { enqueueSnackbar, SnackbarProvider } from 'notistack';
import { RouterProvider } from 'react-router-dom';

// project imports
import { isTransportError } from 'api/request';
import { RouteAccessProvider } from 'contexts/RouteAccessContext';
import router from 'routes';
import ThemeCustomization from 'themes';

// Transport-level failures (network errors, 5xx) aren't tied to a specific page/action,
// so they're toasted here once. Business errors (4xx) are left for the calling
// component to interpret and display (see isTransportError in api/request.js).
function handleTransportError(error) {
  if (isTransportError(error)) {
    enqueueSnackbar(error?.message || 'Something went wrong, please try again later.', { variant: 'error' });
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleTransportError }),
  mutationCache: new MutationCache({ onError: handleTransportError }),
});

// ==============================|| APP - THEME, ROUTER, LOCAL ||============================== //

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeCustomization>
        <SnackbarProvider maxSnack={3} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
          <RouteAccessProvider>
            <RouterProvider router={router} />
          </RouteAccessProvider>
        </SnackbarProvider>
      </ThemeCustomization>
    </QueryClientProvider>
  );
}
