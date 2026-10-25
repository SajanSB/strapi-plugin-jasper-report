import { PLUGIN_ID } from '../pluginId';

const policies = [
  'admin::isAuthenticatedAdmin',
  { name: 'admin::hasPermissions', config: { actions: [`plugin::${PLUGIN_ID}.manage`] } },
];

export default {
  type: 'admin',
  routes: [
    { method: 'GET', path: '/java-status', handler: 'template.javaStatus', config: { policies } },
    { method: 'GET', path: '/templates', handler: 'template.find', config: { policies } },
    { method: 'POST', path: '/templates', handler: 'template.create', config: { policies } },
    { method: 'PUT', path: '/templates/:id', handler: 'template.update', config: { policies } },
    { method: 'DELETE', path: '/templates/:id', handler: 'template.delete', config: { policies } },
    { method: 'GET', path: '/templates/:id/generate', handler: 'template.generate', config: { policies } },
  ],
};
