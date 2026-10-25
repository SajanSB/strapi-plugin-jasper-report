import { FilePdf } from '@strapi/icons';
import { PLUGIN_ID } from './pluginId';

export default {
  register(app: any) {
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: FilePdf,
      intlLabel: { id: `${PLUGIN_ID}.plugin.name`, defaultMessage: 'Jasper Reports' },
      Component: async () => {
        const { App } = await import('./pages/App');
        return App;
      },
      permissions: [{ action: `plugin::${PLUGIN_ID}.manage`, subject: null }],
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      name: PLUGIN_ID,
      isReady: true,
    });
  },

  async registerTrads() {
    return [];
  },
};
