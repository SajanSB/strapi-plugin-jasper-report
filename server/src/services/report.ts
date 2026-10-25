import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Core } from '@strapi/strapi';
import { errors } from '../errors';
import { PLUGIN_ID } from '../pluginId';
import { usesSqlQuery } from '../sql';

const FORMATS: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  html: 'text/html; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
};

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const settings = () => strapi.config.get(`plugin::${PLUGIN_ID}`) as any;

  const jdbcConfig = () => {
    const cfg = settings();
    if (cfg.jdbc?.url) return cfg.jdbc;

    const db = strapi.config.get('database.connection') as any;
    if (db.client !== 'postgres') {
      throw new errors.ApplicationError('Automatic JDBC settings only support PostgreSQL. Provide jdbc.url in the plugin config.');
    }
    const c = db.connection ?? {};
    return {
      url: `jdbc:postgresql://${c.host ?? 'localhost'}:${c.port ?? 5432}/${c.database}${c.schema ? `?currentSchema=${c.schema}` : ''}`,
      user: c.user,
      password: c.password,
    };
  };

  return {
    formats: Object.keys(FORMATS),

    async generate(
      template: { slug: string; jrxml: string; engine?: '7' | '6' },
      options: { format?: string; parameters?: Record<string, unknown> }
    ) {
      const format = (options.format ?? 'pdf').toLowerCase();
      if (!FORMATS[format]) {
        throw new errors.ValidationError(`Unsupported format "${format}". Use one of: ${Object.keys(FORMATS).join(', ')}`);
      }
      // Reports always read their rows from the database through the SQL query in the template.
      if (!usesSqlQuery(template.jrxml)) {
        throw new errors.ValidationError('This template has no SQL query, so it cannot be run. Upload a template that contains one.');
      }
      const jdbc = jdbcConfig();

      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jasper-'));
      try {
        const templateFile = path.join(dir, 'template.jrxml');
        const outputFile = path.join(dir, `output.${format}`);
        const configFile = path.join(dir, 'config.json');
        await fs.writeFile(templateFile, template.jrxml, 'utf8');
        await fs.writeFile(
          configFile,
          JSON.stringify({
            template: templateFile,
            output: outputFile,
            format,
            parameters: options.parameters ?? {},
            jdbc,
          }),
          { encoding: 'utf8', mode: 0o600 }
        );

        try {
          await strapi.plugin(PLUGIN_ID).service('java').run(template.engine ?? '7', ['run', configFile]);
        } catch (error: any) {
          throw new errors.ApplicationError(`Report generation failed: ${error.message}`);
        }

        return {
          buffer: await fs.readFile(outputFile),
          mime: FORMATS[format],
          filename: `${template.slug}.${format}`,
        };
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
  };
};
