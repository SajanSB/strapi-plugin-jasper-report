import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Core } from '@strapi/strapi';
import { errors } from '../errors';
import { PLUGIN_ID } from '../pluginId';
import { usesSqlQuery } from '../sql';

const UID = `plugin::${PLUGIN_ID}.template` as any;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/\.jrxml$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const settings = () => strapi.config.get(`plugin::${PLUGIN_ID}`) as any;
  const javaService = () => strapi.plugin(PLUGIN_ID).service('java');

  /** Basic checks that run before anything is stored or handed to Java. */
  const assertSafeJrxml = (xml: string) => {
    if (Buffer.byteLength(xml) > settings().maxTemplateSize) {
      throw new errors.ValidationError('The .jrxml file is too large');
    }
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
      throw new errors.ValidationError('DOCTYPE and ENTITY declarations are not allowed in templates');
    }
    if (!/<jasperReport[\s>]/.test(xml)) {
      throw new errors.ValidationError('This file is not a JasperReports template (missing <jasperReport> root)');
    }
    if (!usesSqlQuery(xml)) {
      throw new errors.ValidationError(
        'This template has no SQL query. Add a query to the report (Dataset and Query) in Jaspersoft Studio and upload it again.'
      );
    }
  };

  const brief = (message: string) => message.replace(/\s+/g, ' ').slice(0, 400);

  /**
   * Compiles the template with Java to validate it and read its parameters and fields.
   * JasperReports 7 (Jaspersoft Studio 7 files) is tried first, then 6.x (older files).
   */
  const inspect = async (xml: string) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jasper-'));
    const failures: string[] = [];
    try {
      const file = path.join(dir, 'template.jrxml');
      await fs.writeFile(file, xml, 'utf8');
      for (const engine of ['7', '6'] as const) {
        try {
          const out = await javaService().run(engine, ['validate', file]);
          return { ...(JSON.parse(out) as { parameters: unknown[]; fields: unknown[] }), engine };
        } catch (error: any) {
          failures.push(`JasperReports ${engine}: ${brief(error.message)}`);
        }
      }
      throw new errors.ValidationError(`Template could not be compiled. ${failures.join(' | ')}`);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  };

  const uniqueSlug = async (base: string, ignoreDocumentId?: string) => {
    let slug = base || 'report';
    let n = 1;
    for (;;) {
      const existing = await strapi.documents(UID).findFirst({ filters: { slug } });
      if (!existing || existing.documentId === ignoreDocumentId) return slug;
      n += 1;
      slug = `${base}-${n}`;
    }
  };

  const withoutBody = ({ jrxml, ...rest }: any) => ({ ...rest, usesSql: usesSqlQuery(jrxml ?? '') });

  return {
    async find() {
      const rows = await strapi.documents(UID).findMany({ sort: 'createdAt:desc' });
      return rows.map(withoutBody);
    },

    async findBySlug(slug: string) {
      return strapi.documents(UID).findFirst({ filters: { slug } });
    },

    async findOne(documentId: string) {
      return strapi.documents(UID).findOne({ documentId });
    },

    async create({ name, description, jrxml }: { name: string; description?: string; jrxml: string }) {
      assertSafeJrxml(jrxml);
      const info = await inspect(jrxml);
      const slug = await uniqueSlug(slugify(name));
      const created = await strapi.documents(UID).create({
        data: { name, slug, description, jrxml, engine: info.engine, parameters: info.parameters, fields: info.fields },
      });
      return withoutBody(created);
    },

    async update(documentId: string, { name, description, jrxml }: { name?: string; description?: string; jrxml?: string }) {
      const data: Record<string, unknown> = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;
      if (jrxml !== undefined) {
        assertSafeJrxml(jrxml);
        const info = await inspect(jrxml);
        data.jrxml = jrxml;
        data.engine = info.engine;
        data.parameters = info.parameters;
        data.fields = info.fields;
      }
      const updated = await strapi.documents(UID).update({ documentId, data });
      return withoutBody(updated);
    },

    async delete(documentId: string) {
      await strapi.documents(UID).delete({ documentId });
    },
  };
};
