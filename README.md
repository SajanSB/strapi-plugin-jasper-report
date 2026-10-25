# strapi-plugin-jasper-report

Upload JasperReports `.jrxml` templates in the Strapi admin and generate **PDF, XLSX, DOCX, HTML and CSV** reports through an API.

## Requirements

- Strapi 5
- **A Java JDK/JRE 11 or newer on the machine that runs Strapi.** The plugin runs JasperReports (bundled) through your installed `java`.
  It is found via, in order: the `javaPath` option, `$JAVA_HOME/bin/java`, then `java` on the `PATH`.

## Install

```bash
npm install strapi-plugin-jasper-report
```

The plugin is enabled automatically, so no configuration is needed. Optional settings go in `config/plugins.js`:

```js
module.exports = {
  'jasper-report': {
    config: {
      // javaPath: '/usr/lib/jvm/java-17/bin/java', // only if Java is not found automatically
      // timeoutMs: 60000,
      // maxTemplateSize: 5 * 1024 * 1024,
      // jdbc: { url: 'jdbc:postgresql://host:5432/db', user: 'u', password: 'p' }, // default: the Strapi database
    },
  },
};
```

Rebuild the admin (`npm run build`) and restart Strapi.

## Usage

1. Design your report in Jaspersoft Studio and save the `.jrxml`.
2. Open **Jasper Reports** in the admin menu and upload it. The template is compiled to validate it, and its parameters and fields are listed. Use **Test** to try it with sample data.
3. Grant access: Settings → Users & Permissions → Roles → *Jasper-report* → `generate`, or create an API token.
4. Generate:

```bash
curl -X POST http://localhost:1337/api/jasper-report/generate/<slug> \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{
    "format": "pdf",
    "parameters": { "title": "Monthly sales" }
  }' --output report.pdf
```

| Body field | Description |
| --- | --- |
| `format` | `pdf` (default), `xlsx`, `docx`, `html`, `csv` |
| `parameters` | Object of report parameters; converted to the type declared in the `.jrxml` (dates as ISO strings) |

Templates **must contain a SQL query**; templates without one are rejected on upload and never run. The query runs through JDBC against the Strapi database. With PostgreSQL the Strapi connection settings are used automatically; for other databases set `jdbc: { url, user, password }` (you must add the matching JDBC driver jar to `server/java/v6/lib` and `server/java/v7/lib`).

The `/generate` route is a normal content-API route, so it is protected by Strapi roles and API tokens.

## JasperReports versions

Two engines are bundled: **JasperReports 7.1** (templates saved by Jaspersoft Studio 7) and **6.21** (older Studio versions). On upload each template is compiled with 7 first, then 6, and the engine that works is remembered for that template. Add extra JDBC drivers to `server/java/v6/lib` and `server/java/v7/lib`.

## Security notes

- Templates containing `DOCTYPE`/`ENTITY` are rejected.
- Java is started without a shell, with a timeout, and temporary files are removed after each run.
- JRXML can contain Java/Groovy expressions that execute on the server. Only let trusted admins upload templates.

## Licenses

Plugin: MIT. Bundled libraries: JasperReports (LGPL-3.0), Apache POI and others (Apache-2.0), PostgreSQL JDBC (BSD-2). See `server/java/v6/lib` and `server/java/v7/lib`.
