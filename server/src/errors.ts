export type ErrorKind = 'validation' | 'notFound' | 'forbidden' | 'application';

/** Plugin-local errors; controllers map them to HTTP responses (avoids relying on a shared @strapi/utils instance). */
export class PluginError extends Error {
  constructor(public kind: ErrorKind, message: string) {
    super(message);
  }
}

export const errors = {
  ValidationError: class extends PluginError {
    constructor(message: string) {
      super('validation', message);
    }
  },
  NotFoundError: class extends PluginError {
    constructor(message: string) {
      super('notFound', message);
    }
  },
  ForbiddenError: class extends PluginError {
    constructor(message: string) {
      super('forbidden', message);
    }
  },
  ApplicationError: class extends PluginError {
    constructor(message: string) {
      super('application', message);
    }
  },
};

/** Runs a controller body and converts PluginError into the matching Koa response. */
export const handle = async (ctx: any, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof PluginError)) throw error;
    const map = { validation: 'badRequest', notFound: 'notFound', forbidden: 'forbidden', application: 'internalServerError' } as const;
    return ctx[map[error.kind]](error.message);
  }
};
