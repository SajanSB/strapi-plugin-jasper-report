import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import net.sf.jasperreports.engine.JRDataSource;
import net.sf.jasperreports.engine.JRException;
import net.sf.jasperreports.engine.JRField;
import net.sf.jasperreports.engine.JRParameter;
import net.sf.jasperreports.engine.JasperCompileManager;
import net.sf.jasperreports.engine.JasperFillManager;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.JasperReport;
import net.sf.jasperreports.engine.JREmptyDataSource;
import net.sf.jasperreports.json.data.JsonDataSource;
import net.sf.jasperreports.engine.export.HtmlExporter;
import net.sf.jasperreports.engine.export.JRCsvExporter;
import net.sf.jasperreports.engine.export.ooxml.JRDocxExporter;
import net.sf.jasperreports.engine.export.ooxml.JRXlsxExporter;
import net.sf.jasperreports.pdf.JRPdfExporter;
import net.sf.jasperreports.export.SimpleExporterInput;
import net.sf.jasperreports.export.SimpleHtmlExporterOutput;
import net.sf.jasperreports.export.SimpleOutputStreamExporterOutput;
import net.sf.jasperreports.export.SimpleWriterExporterOutput;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.sql.Connection;
import java.sql.DriverManager;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;

/**
 * Command line bridge between the Strapi plugin and JasperReports.
 *
 * Engine: JasperReports 7.x (templates saved by Jaspersoft Studio 7).
 *
 * Usage (Java 11+, source-file mode, no javac step needed):
 *   java -cp "lib/*" Runner.java validate <template.jrxml>
 *   java -cp "lib/*" Runner.java run <config.json>
 *
 * "validate" prints {"parameters":[...],"fields":[...]} to stdout.
 * "run" reads the config, fills the report and writes the export to config.output.
 * Errors are written to stderr and the exit code is non-zero.
 */
public class Runner {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  public static void main(String[] args) {
    System.setProperty("java.awt.headless", "true");
    try {
      if (args.length < 2) {
        throw new IllegalArgumentException("Usage: Runner validate <jrxml> | run <config.json>");
      }
      switch (args[0]) {
        case "validate":
          validate(new File(args[1]));
          break;
        case "run":
          run(MAPPER.readTree(new File(args[1])));
          break;
        default:
          throw new IllegalArgumentException("Unknown command: " + args[0]);
      }
    } catch (Throwable t) {
      Throwable root = t;
      while (root.getCause() != null && root.getCause() != root) {
        root = root.getCause();
      }
      if (System.getenv("JASPER_DEBUG") != null) {
        t.printStackTrace();
      }
      System.err.println(t.getMessage() != null ? t.getMessage() : t.toString());
      if (root != t && root.getMessage() != null) {
        System.err.println("Caused by: " + root.getMessage());
      }
      System.exit(1);
    }
  }

  /** JasperReports 7 rejects a root element that still declares the old XML namespace. */
  private static byte[] stripNamespace(byte[] xml) {
    String text = new String(xml, StandardCharsets.UTF_8);
    int start = text.indexOf("<jasperReport");
    if (start < 0) {
      return xml;
    }
    int end = text.indexOf('>', start);
    String root = text.substring(start, end)
        .replaceAll("\\sxmlns=\"[^\"]*\"", "")
        .replaceAll("\\sxmlns:xsi=\"[^\"]*\"", "")
        .replaceAll("\\sxsi:schemaLocation=\"[^\"]*\"", "");
    return (text.substring(0, start) + root + text.substring(end)).getBytes(StandardCharsets.UTF_8);
  }

  private static JasperReport compile(File jrxml) throws Exception {
    byte[] xml = stripNamespace(Files.readAllBytes(jrxml.toPath()));
    return JasperCompileManager.compileReport(new ByteArrayInputStream(xml));
  }

  private static void validate(File jrxml) throws Exception {
    JasperReport report = compile(jrxml);
    ObjectNode out = MAPPER.createObjectNode();
    ArrayNode params = out.putArray("parameters");
    for (JRParameter p : report.getParameters()) {
      if (p.isSystemDefined() || !p.isForPrompting()) {
        continue;
      }
      ObjectNode n = params.addObject();
      n.put("name", p.getName());
      n.put("type", p.getValueClassName());
    }
    ArrayNode fields = out.putArray("fields");
    for (JRField f : report.getFields()) {
      ObjectNode n = fields.addObject();
      n.put("name", f.getName());
      n.put("type", f.getValueClassName());
    }
    System.out.println(MAPPER.writeValueAsString(out));
  }

  private static void run(JsonNode cfg) throws Exception {
    File jrxml = new File(text(cfg, "template"));
    File output = new File(text(cfg, "output"));
    String format = text(cfg, "format").toLowerCase();

    JasperReport report = compile(jrxml);
    Map<String, Object> params = buildParameters(report, cfg.get("parameters"));

    JasperPrint print;
    JsonNode jdbc = cfg.get("jdbc");
    if (jdbc != null && !jdbc.isNull()) {
      try (Connection conn = DriverManager.getConnection(
          text(jdbc, "url"), optText(jdbc, "user"), optText(jdbc, "password"))) {
        print = JasperFillManager.fillReport(report, params, conn);
      }
    } else {
      JRDataSource ds = buildDataSource(cfg, report);
      print = JasperFillManager.fillReport(report, params, ds);
    }

    export(print, format, output);
  }

  private static JRDataSource buildDataSource(JsonNode cfg, JasperReport report) throws JRException {
    JsonNode data = cfg.get("data");
    if (data == null || data.isNull()) {
      return new JREmptyDataSource();
    }
    // Arrays are wrapped so that a fixed select expression always works.
    ObjectNode root = MAPPER.createObjectNode();
    String select;
    if (data.isArray()) {
      blankToNull(data, report);
      root.set("data", data);
      select = "data";
    } else {
      root.setAll((ObjectNode) data);
      select = optText(cfg, "dataPath");
      if (select == null) {
        select = "";
      }
    }
    byte[] bytes = root.toString().getBytes(StandardCharsets.UTF_8);
    return new JsonDataSource(new ByteArrayInputStream(bytes), select);
  }

  /**
   * Empty strings cannot be parsed as numbers, booleans or dates. For fields declared with such a
   * class, "" is replaced with null in each row so the report treats it as missing.
   */
  private static void blankToNull(JsonNode rows, JasperReport report) {
    java.util.Set<String> typed = new java.util.HashSet<>();
    for (JRField f : report.getFields()) {
      String c = f.getValueClassName();
      if (c.startsWith("java.lang.") && !c.equals("java.lang.String") && !c.equals("java.lang.Object")
          || c.startsWith("java.math.") || c.startsWith("java.util.Date") || c.startsWith("java.sql.")) {
        typed.add(f.getName());
      }
    }
    for (JsonNode row : rows) {
      if (!row.isObject()) {
        continue;
      }
      ObjectNode obj = (ObjectNode) row;
      for (String name : typed) {
        JsonNode v = obj.get(name);
        if (v != null && v.isTextual() && v.asText().trim().isEmpty()) {
          obj.putNull(name);
        }
      }
    }
  }

  private static Map<String, Object> buildParameters(JasperReport report, JsonNode values) {
    Map<String, Object> out = new HashMap<>();
    if (values == null || !values.isObject()) {
      return out;
    }
    for (JRParameter p : report.getParameters()) {
      if (p.isSystemDefined() || !values.has(p.getName())) {
        continue;
      }
      JsonNode v = values.get(p.getName());
      if (v.isNull()) {
        out.put(p.getName(), null);
        continue;
      }
      out.put(p.getName(), convert(v, p.getValueClassName()));
    }
    return out;
  }

  private static Object convert(JsonNode v, String cls) {
    switch (cls) {
      case "java.lang.String":
        return v.asText();
      case "java.lang.Integer":
        return v.asInt();
      case "java.lang.Long":
        return v.asLong();
      case "java.lang.Short":
        return (short) v.asInt();
      case "java.lang.Double":
        return v.asDouble();
      case "java.lang.Float":
        return (float) v.asDouble();
      case "java.lang.Boolean":
        return v.asBoolean();
      case "java.math.BigDecimal":
        return new BigDecimal(v.asText());
      case "java.util.Date":
      case "java.sql.Timestamp":
        return new java.sql.Timestamp(parseDate(v.asText()));
      case "java.sql.Date":
        return new java.sql.Date(parseDate(v.asText()));
      default:
        return v.isTextual() ? v.asText() : v.toString();
    }
  }

  private static long parseDate(String s) {
    if (s.matches("-?\\d+")) {
      return Long.parseLong(s);
    }
    try {
      return Instant.parse(s).toEpochMilli();
    } catch (Exception ignored) {
      // fall through
    }
    try {
      return LocalDateTime.parse(s).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    } catch (Exception ignored) {
      // fall through
    }
    return LocalDate.parse(s).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
  }

  private static void export(JasperPrint print, String format, File output) throws Exception {
    switch (format) {
      case "pdf": {
        JRPdfExporter e = new JRPdfExporter();
        e.setExporterInput(new SimpleExporterInput(print));
        e.setExporterOutput(new SimpleOutputStreamExporterOutput(output));
        e.exportReport();
        break;
      }
      case "xlsx": {
        JRXlsxExporter e = new JRXlsxExporter();
        e.setExporterInput(new SimpleExporterInput(print));
        e.setExporterOutput(new SimpleOutputStreamExporterOutput(output));
        e.exportReport();
        break;
      }
      case "docx": {
        JRDocxExporter e = new JRDocxExporter();
        e.setExporterInput(new SimpleExporterInput(print));
        e.setExporterOutput(new SimpleOutputStreamExporterOutput(output));
        e.exportReport();
        break;
      }
      case "html": {
        HtmlExporter e = new HtmlExporter();
        e.setExporterInput(new SimpleExporterInput(print));
        e.setExporterOutput(new SimpleHtmlExporterOutput(output));
        e.exportReport();
        break;
      }
      case "csv": {
        JRCsvExporter e = new JRCsvExporter();
        e.setExporterInput(new SimpleExporterInput(print));
        e.setExporterOutput(new SimpleWriterExporterOutput(output));
        e.exportReport();
        break;
      }
      default:
        throw new IllegalArgumentException("Unsupported format: " + format);
    }
  }

  private static String text(JsonNode n, String key) {
    JsonNode v = n.get(key);
    if (v == null || v.isNull()) {
      throw new IllegalArgumentException("Missing config value: " + key);
    }
    return v.asText();
  }

  private static String optText(JsonNode n, String key) {
    JsonNode v = n.get(key);
    return v == null || v.isNull() ? null : v.asText();
  }
}
