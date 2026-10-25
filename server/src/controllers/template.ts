import fs from 'node:fs/promises';
import type { Core } from '@strapi/strapi';
import { errors, handle } from '../errors';
import { PLUGIN_ID } from '../pluginId';

const svc = (strapi: Core.Strapi, name: string) => strapi.plugin(PLUGIN_ID).service(name);

const readUpload = async (ctx: any): Promise<string | undefined> => {
  const file = ctx.request.files?.file;
  const single = Array.isArray(file) ? file[0] : file;
  if (!single) return undefined;
  const name: string = single.originalFilename ?? single.name ?? '';
  if (!name.toLowerCase().endsWith('.jrxml')) {
    throw new errors.ValidationError('Only .jrxml files can be uploaded');
  }
  return fs.readFile(single.filepath ?? single.path, 'utf8');
};

const body = (ctx: any) => ctx.request.body ?? {};

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async javaStatus(ctx: any) {
    return handle(ctx, async () => {
      ctx.body = await svc(strapi, 'java').getStatus();
    });
  },

  async find(ctx: any) {
    return handle(ctx, async () => {
      ctx.body = { data: await svc(strapi, 'template').find() };
    });
  },

  async create(ctx: any) {
    return handle(ctx, async () => {
      const jrxml = await readUpload(ctx);
      if (!jrxml) throw new errors.ValidationError('A .jrxml file is required (multipart field "file")');
      const { name, description } = body(ctx);
      const original = ctx.request.files?.file;
      const fallbackName = String((Array.isArray(original) ? original[0] : original)?.originalFilename ?? 'report').replace(/\.jrxml$/i, '');
      ctx.body = { data: await svc(strapi, 'template').create({ name: name || fallbackName, description, jrxml }) };
    });
  },

  async update(ctx: any) {
    return handle(ctx, async () => {
      const jrxml = await readUpload(ctx);
      const { name, description } = body(ctx);
      ctx.body = { data: await svc(strapi, 'template').update(ctx.params.id, { name, description, jrxml }) };
    });
  },

  async delete(ctx: any) {
    return handle(ctx, async () => {
      await svc(strapi, 'template').delete(ctx.params.id);
      ctx.body = { data: { documentId: ctx.params.id } };
    });
  },

  /** Test generation from the admin panel. */
  async generate(ctx: any) {
    return handle(ctx, async () => {
      const template = await svc(strapi, 'template').findOne(ctx.params.id);
      if (!template) throw new errors.NotFoundError('Template not found');
      let parameters: Record<string, unknown> | undefined;
        try {
          parameters = ctx.query.parameters ? JSON.parse(String(ctx.query.parameters)) : undefined;
        } catch {
          throw new errors.ValidationError('parameters must be valid JSON');
        }
        const result = await svc(strapi, 'report').generate(template, { format: ctx.query.format as string, parameters });
      ctx.set('Content-Type', result.mime);
      ctx.set('Content-Disposition', `attachment; filename="${result.filename}"`);
      ctx.body = result.buffer;
    });
  },
});
