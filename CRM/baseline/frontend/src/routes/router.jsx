import { createBrowserRouter, Navigate } from 'react-router-dom';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import SellRoundedIcon from '@mui/icons-material/SellRounded';

import { AppLayout } from '../layout/AppLayout';
import { CustomerDetailPage } from '../pages/customers/CustomerDetailPage';
import { CustomersPage } from '../pages/customers/CustomersPage';

const appRoutes = [
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
        handle: {
          navigation: {
            id: 'customers',
            label: 'Customers',
            caption: 'List, detail, contacts, interactions and deals',
            to: '/customers',
            icon: PeopleAltRoundedIcon,
          },
        },
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
];

export const navigationItems = appRoutes[0].children
  .filter((route) => route.handle?.navigation)
  .map((route) => route.handle.navigation);

export const router = createBrowserRouter(appRoutes);