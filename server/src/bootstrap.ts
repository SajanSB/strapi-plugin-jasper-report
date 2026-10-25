import type { Core } from '@strapi/strapi';
import { PLUGIN_ID } from './pluginId';

const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  await strapi.admin.services.permission.actionProvider.registerMany([
    {
      section: 'plugins',
      displayName: 'Manage Jasper report templates',
      uid: 'manage',
      pluginName: PLUGIN_ID,
    },
  ]);

  const status = await strapi.plugin(PLUGIN_ID).service('java').getStatus();
  if (!status.available) {
    strapi.log.warn(
      `[${PLUGIN_ID}] Java was not found (${status.error}). Install a JDK 11+ and make sure "java" is on the PATH, JAVA_HOME is set, or set the javaPath plugin option.`
    );
  } else {
    strapi.log.info(`[${PLUGIN_ID}] Using Java ${status.version}`);
  }
};

export default bootstrap;
