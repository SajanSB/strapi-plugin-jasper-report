import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Core } from '@strapi/strapi';
import { PLUGIN_ID } from '../pluginId';

const MIN_JAVA_MAJOR = 11;

export type Engine = '7' | '6';

/** Finds the runner folder (server/java/v7 or v6) inside the plugin package. */
const findRunnerDir = (engine: Engine): string => {
  let dir = __dirname;
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, 'server', 'java', `v${engine}`);
    if (fs.existsSync(path.join(candidate, 'Runner.java'))) {
      return candidate;
    }
    dir = path.dirname(dir);
  }
  throw new Error(`jasper-report: server/java/v${engine}/Runner.java not found in the plugin package`);
};

const parseMajor = (output: string): number | null => {
  const match = output.match(/version "(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  const major = Number(match[1]);
  return major === 1 ? Number(match[2]) : major;
};

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const settings = () => strapi.config.get(`plugin::${PLUGIN_ID}`) as any;

  const javaBinary = (): string => {
    const configured = settings().javaPath as string;
    if (configured) return configured;
    if (process.env.JAVA_HOME) {
      const bin = path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
      if (fs.existsSync(bin)) return bin;
    }
    return 'java';
  };

  return {
    async getStatus() {
      const java = javaBinary();
      return new Promise<{ available: boolean; version?: string; major?: number; path: string; error?: string }>(
        (resolve) => {
          execFile(java, ['-version'], { timeout: 10000 }, (error, stdout, stderr) => {
            if (error) {
              resolve({ available: false, path: java, error: (error as any).code === 'ENOENT' ? 'java executable not found' : error.message });
              return;
            }
            const output = `${stderr}${stdout}`;
            const major = parseMajor(output);
            const version = output.match(/version "([^"]+)"/)?.[1];
            if (major === null || major < MIN_JAVA_MAJOR) {
              resolve({
                available: false,
                version,
                major: major ?? undefined,
                path: java,
                error: `Java ${MIN_JAVA_MAJOR} or newer is required (found ${version ?? 'unknown'})`,
              });
              return;
            }
            resolve({ available: true, version, major, path: java });
          });
        }
      );
    },

    /** Runs the Java bridge. Arguments are passed as an array, never through a shell. */
    async run(engine: Engine, args: string[]): Promise<string> {
      const runnerDir = findRunnerDir(engine);
      const javaArgs = [
        '-Djava.awt.headless=true',
        '-Xmx512m',
        '-cp',
        path.join(runnerDir, 'lib', '*'),
        path.join(runnerDir, 'Runner.java'),
        ...args,
      ];
      return new Promise<string>((resolve, reject) => {
        execFile(
          javaBinary(),
          javaArgs,
          { cwd: runnerDir, timeout: settings().timeoutMs, maxBuffer: 10 * 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error) {
              if ((error as any).code === 'ENOENT') {
                reject(new Error('Java was not found. Install a JDK 11+ or set the javaPath option.'));
              } else if ((error as any).killed) {
                reject(new Error('Report generation timed out'));
              } else {
                reject(new Error(stderr.trim() || error.message));
              }
              return;
            }
            resolve(stdout);
          }
        );
      });
    },
  };
};
