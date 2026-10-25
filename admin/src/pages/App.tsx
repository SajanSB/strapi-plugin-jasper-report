import { useCallback, useEffect, useRef, useState } from 'react';
import { Layouts, Page, useFetchClient, useNotification } from '@strapi/strapi/admin';
import {
  Alert,
  Box,
  Button,
  Field,
  Flex,
  IconButton,
  Modal,
  SingleSelect,
  SingleSelectOption,
  Table,
  Tbody,
  Td,
  Textarea,
  Th,
  Thead,
  Tr,
  Typography,
} from '@strapi/design-system';
import { Download, Plus, Trash, Upload } from '@strapi/icons';
import { PLUGIN_ID } from '../pluginId';

type Param = { name: string; type: string };
type Template = {
  documentId: string;
  name: string;
  slug: string;
  description?: string;
  parameters?: Param[];
  fields?: Param[];
  usesSql?: boolean;
};
type JavaStatus = { available: boolean; version?: string; path: string; error?: string };

const base = `/${PLUGIN_ID}`;
const FORMATS = ['pdf', 'xlsx', 'docx', 'html', 'csv'];

/** Placeholder value that is valid for the declared Java type, so a test run works out of the box. */
const sampleValue = (type: string): string | number | boolean => {
  if (/\.(Integer|Long|Short|Byte|BigInteger)$/.test(type)) return 0;
  if (/\.(Double|Float|BigDecimal)$/.test(type)) return 0;
  if (/\.Boolean$/.test(type)) return false;
  if (/\.(Date|Timestamp)$/.test(type)) return new Date().toISOString().slice(0, 10);
  return '';
};

const parseJson = (text: string) => {
  if (!text.trim()) return undefined;
  return JSON.parse(text);
};

const errorMessage = (err: any) => err?.response?.data?.error?.message ?? err?.message ?? 'Unexpected error';

const TestDialog = ({ template, onClose }: { template: Template | null; onClose: () => void }) => {
  const { get } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [format, setFormat] = useState('pdf');
  const [params, setParams] = useState('{}');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (template) {
      const sample = Object.fromEntries((template.parameters ?? []).map((p) => [p.name, sampleValue(p.type)]));
      setParams(JSON.stringify(sample, null, 2));
    }
  }, [template]);

  const run = async () => {
    if (!template) return;
    setBusy(true);
    try {
      const query = new URLSearchParams({ format });
      const parsed = parseJson(params);
      if (parsed) query.set('parameters', JSON.stringify(parsed));
      // Only GET supports responseType: 'blob' in the admin fetch client.
      const { data: blob } = await get(`${base}/templates/${template.documentId}/generate?${query}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.slug}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toggleNotification({ type: 'danger', message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal.Root open={!!template} onOpenChange={(open: boolean) => !open && onClose()}>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>Test "{template?.name}"</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Flex direction="column" alignItems="stretch" gap={4}>
            <Field.Root>
              <Field.Label>Format</Field.Label>
              <SingleSelect value={format} onChange={(v: string | number) => setFormat(String(v))}>
                {FORMATS.map((f) => (
                  <SingleSelectOption key={f} value={f}>
                    {f.toUpperCase()}
                  </SingleSelectOption>
                ))}
              </SingleSelect>
            </Field.Root>
            <Field.Root>
              <Field.Label>Parameters (JSON object)</Field.Label>
              <Textarea value={params} onChange={(e: any) => setParams(e.target.value)} />
            </Field.Root>
            <Typography variant="pi" textColor="neutral600">
              Rows come from the SQL query in the template, using the Strapi database connection.
            </Typography>
          </Flex>
        </Modal.Body>
        <Modal.Footer>
          <Modal.Close>
            <Button variant="tertiary">Close</Button>
          </Modal.Close>
          <Button loading={busy} onClick={run} startIcon={<Download />}>
            Generate
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

export const App = () => {
  const { get, post, del } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [java, setJava] = useState<JavaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [testing, setTesting] = useState<Template | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [list, status] = await Promise.all([
        get<{ data: Template[] }>(`${base}/templates`),
        get<JavaStatus>(`${base}/java-status`),
      ]);
      setTemplates(list.data.data);
      setJava(status.data);
    } catch (err: any) {
      toggleNotification({ type: 'danger', message: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  }, [get, toggleNotification]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (file?: File) => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    try {
      await post(`${base}/templates`, form);
      toggleNotification({ type: 'success', message: `Uploaded ${file.name}` });
      await load();
    } catch (err: any) {
      toggleNotification({ type: 'danger', message: errorMessage(err) });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (t: Template) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try {
      await del(`${base}/templates/${t.documentId}`);
      await load();
    } catch (err: any) {
      toggleNotification({ type: 'danger', message: errorMessage(err) });
    }
  };

  if (loading) return <Page.Loading />;

  return (
    <Page.Main>
      <Layouts.Header
        title="Jasper Reports"
        subtitle="Upload .jrxml templates and generate reports through the API"
        primaryAction={
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".jrxml"
              hidden
              onChange={(e) => upload(e.target.files?.[0])}
            />
            <Button
              startIcon={<Plus />}
              loading={uploading}
              disabled={!java?.available}
              onClick={() => fileInput.current?.click()}
            >
              Upload .jrxml
            </Button>
          </>
        }
      />
      <Layouts.Content>
        {java && !java.available && (
          <Box paddingBottom={4}>
            <Alert variant="danger" title="Java is not available" closeLabel="Close">
              {java.error}. Install a JDK 11 or newer and make sure `java` is on the PATH of the Strapi
              process, or set JAVA_HOME / the plugin's javaPath option, then restart Strapi.
            </Alert>
          </Box>
        )}
        {java?.available && (
          <Box paddingBottom={4}>
            <Typography variant="pi" textColor="neutral600">
              Java {java.version} ({java.path})
            </Typography>
          </Box>
        )}

        {templates.length === 0 ? (
          <Flex direction="column" gap={2} padding={8}>
            <Upload width="3rem" height="3rem" />
            <Typography>No templates yet. Upload a .jrxml file to get started.</Typography>
          </Flex>
        ) : (
          <Table colCount={4} rowCount={templates.length}>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>API endpoint</Th>
                <Th>Parameters</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {templates.map((t) => (
                <Tr key={t.documentId}>
                  <Td>
                    <Typography fontWeight="bold">{t.name}</Typography>
                  </Td>
                  <Td>
                    <Typography>
                      <code>POST /api/{PLUGIN_ID}/generate/{t.slug}</code>
                    </Typography>
                  </Td>
                  <Td>
                    <Typography>{(t.parameters ?? []).map((p) => p.name).join(', ') || '-'}</Typography>
                  </Td>
                  <Td>
                    <Flex gap={1}>
                      <Button size="S" variant="secondary" onClick={() => setTesting(t)}>
                        Test
                      </Button>
                      <IconButton label="Delete" onClick={() => remove(t)}>
                        <Trash />
                      </IconButton>
                    </Flex>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Layouts.Content>
      <TestDialog template={testing} onClose={() => setTesting(null)} />
    </Page.Main>
  );
};
