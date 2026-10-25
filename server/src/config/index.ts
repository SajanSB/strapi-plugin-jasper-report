export default {
  default: {
    // Path to the java executable. Defaults to $JAVA_HOME/bin/java, then "java" on the PATH.
    javaPath: '',
    // Kill the Java process if a report takes longer than this.
    timeoutMs: 60000,
    // Maximum accepted .jrxml size in bytes.
    maxTemplateSize: 5 * 1024 * 1024,
    // Explicit JDBC settings: { url, user, password }. When omitted, the Strapi
    // PostgreSQL connection is used.
    jdbc: null,
  },
  validator(config: Record<string, unknown>) {
    if (typeof config.timeoutMs !== 'number' || config.timeoutMs <= 0) {
      throw new Error('jasper-report: timeoutMs must be a positive number');
    }
  },
};
