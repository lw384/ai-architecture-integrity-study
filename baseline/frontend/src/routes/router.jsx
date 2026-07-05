import { createBrowserRouter, Navigate } from 'react-router-dom';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import SellRoundedIcon from '@mui/icons-material/SellRounded';

import { AppLayout } from '../layout/AppLayout';
import { CompaniesPage } from '../pages/companies/CompanyPage';
import { ContactsPage } from '../pages/contacts/ContactsPanel';

const appRoutes = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/contacts" replace />,
      },
      {
        path: 'contacts',
        element: <ContactsPage />,
        handle: {
          navigation: {
            id: 'contacts',
            label: 'Contacts',
            caption: 'List, detail, contacts, interactions and deals',
            to: '/contacts',
            icon: PeopleAltRoundedIcon,
          },
        },
      },
      // {
      //   path: 'customers/:companyId',
      //   element: <CustomerDetailPage />,
      // },
         {
        path: 'companies',
        element: <CompaniesPage />,
        handle: {
          navigation: {
            id: 'companies',
            label: 'Companies',
            caption: 'List, detail, contacts, interactions and deals',
            to: '/companies',
            icon: SellRoundedIcon,
          },
        },
      },
      //  {
      //   path: 'companies/:companyId',
      //   element: <CompanyDetailPage />,
      // },
      {
        path: '*',
        element: <Navigate to="/companies" replace />,
      },
    ],
  },
];

export const navigationItems = appRoutes[0].children
  .filter((route) => route.handle?.navigation)
  .map((route) => route.handle.navigation);

export const router = createBrowserRouter(appRoutes);