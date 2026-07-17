import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContextStore {
  requestId: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContextStore>();

// Correlation id por request (E5-02) — disponible en cualquier punto del
// contexto async del request (services, guards, etc.) sin tener que pasarlo
// manualmente por cada capa.
export const RequestContext = {
  run<T>(store: RequestContextStore, callback: () => T): T {
    return asyncLocalStorage.run(store, callback);
  },
  getRequestId(): string | undefined {
    return asyncLocalStorage.getStore()?.requestId;
  },
};
