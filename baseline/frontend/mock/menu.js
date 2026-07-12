import { routeDefinitions, routeGroups } from 'routes/route-registry';

const menuItems = {
    items: routeGroups.map((group) => ({
        id: group.id,
        title: group.title,
        type: 'group',
        children: routeDefinitions
            .filter((definition) => definition.group === group.id && definition.menu)
            .map((definition) => ({
                id: definition.id,
                title: definition.title,
                type: 'item',
                url: `/${definition.path}`,
                icon: definition.icon,
                breadcrumbs: definition.breadcrumbs ?? false
            }))
    }))
};

export default menuItems;
