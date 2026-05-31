import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AppLayout } from './AppLayout';
import { CustomerDetailPage } from '../features/customers/CustomerDetailPage';
import { CustomersPage } from '../features/customers/CustomersPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/customers" replace />,
      },
      {
        path: 'customers',
        element: <CustomersPage />,
      },
      {
        path: 'customers/:customerId',
        element: <CustomerDetailPage />,
      },
      {
        path: '*',
        element: <Navigate to="/customers" replace />,
      },
    ],
  },
]);