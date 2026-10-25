import type { Core } from '@strapi/strapi';
import { errors, handle } from '../errors';
import { PLUGIN_ID } from '../pluginId';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * POST /api/jasper-report/generate/:slug
   * Body: { format?, parameters?, data?, dataPath?, useDb? }
   */
  async generate(ctx: any) {
    return handle(ctx, async () => {
      const plugin = strapi.plugin(PLUGIN_ID);
      const template = await plugin.service('template').findBySlug(ctx.params.slug);
      if (!template) throw new errors.NotFoundError(`No report template with slug "${ctx.params.slug}"`);
  
      const result = await plugin.service('report').generate(template, ctx.request.body ?? {});
      ctx.set('Content-Type', result.mime);
      ctx.set('Content-Disposition', `attachment; filename="${result.filename}"`);
      ctx.body = result.buffer;
    });
  },
});
