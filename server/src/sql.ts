/**
 * True when the template's main query is SQL (no language, or language="sql"), meaning the report reads
 * its rows from the database. JSON, XPath and other query languages return false.
 */
export const usesSqlQuery = (jrxml: string): boolean => {
  const match = jrxml.match(/<(query|queryString)\b([^>]*)>([\s\S]*?)<\/\1>/);
  if (!match) return false;
  const language = match[2].match(/language\s*=\s*"([^"]*)"/)?.[1]?.toLowerCase();
  if (language && language !== 'sql') return false;
  const text = match[3].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
  return text.length > 0;
};
