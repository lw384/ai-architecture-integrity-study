import { BankOutlined, TeamOutlined } from '@ant-design/icons';

// ==============================|| ROUTE REGISTRY||============================== //
// Consumed by MainRoutes.jsx (router), route-access.config.js (access control)
// and mock/menu.js (sidebar) so path/id/menu metadata is defined exactly once.

export const routeGroups = [{ id: 'group-dashboard', title: 'Navigation' }];

export const routeDefinitions = [
    {
        id: 'contacts',
        path: 'contacts',
        default: true,
        group: 'group-dashboard',
        title: 'Contacts',
        icon: TeamOutlined,
        menu: true,
        public: false,
        external: false,
        breadcrumbs: false,
        loader: () => import('pages/contacts')
    },
    {
        id: 'contact-detail',
        accessId: 'contacts', // reuses the contacts permission bucket, no separate backend entry needed
        path: 'contacts/:id',
        group: null,
        title: null,
        icon: null,
        menu: false,
        public: false,
        external: false,
        breadcrumbs: false,
        loader: () => import('pages/contacts/ContactDetail')
    },
    {
        id: 'companies',
        path: 'companies',
        group: 'group-dashboard',
        title: 'Companies',
        icon: BankOutlined,
        menu: true,
        public: false,
        external: false,
        breadcrumbs: false,
        loader: () => import('pages/companies')
    },
    {
        id: 'company-detail',
        accessId: 'companies', // reuses the companies permission bucket, no separate backend entry needed
        path: 'companies/:id',
        group: null,
        title: null,
        icon: null,
        menu: false,
        public: false,
        external: false,
        breadcrumbs: false,
        loader: () => import('pages/companies/CompanyDetail')
    },
    // {
    //     id: 'dashboard',
    //     path: 'dashboard/default',
    //     group: 'group-dashboard',
    //     title: 'Dashboard',
    //     icon: DashboardOutlined,
    //     menu: true,
    //     public: false,
    //     external: false,
    //     breadcrumbs: false,
    //     loader: () => import('pages/dashboard/default')
    // }
];
