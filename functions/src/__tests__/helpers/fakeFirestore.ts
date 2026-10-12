/**
 * Minimal in-memory stand-in for the parts of the Firestore Admin SDK that the
 * wallet, GA4 and webhook code uses: collections, docs (get/set/update),
 * equality `where` + `limit`, and transactions (reads first, writes on commit).
 */
export type Doc = Record<string, unknown>;

export interface Ref {
  col: string;
  id: string;
  get(): Promise<Snap>;
  set(value: Doc, opts?: { merge?: boolean }): Promise<void>;
  update(value: Doc): Promise<void>;
}

interface Snap {
  exists: boolean;
  id: string;
  ref: Ref;
  data(): Doc | undefined;
}

export interface FakeFirestore {
  db: unknown;
  /** All documents of a collection, keyed by id. */
  all(col: string): Map<string, Doc>;
  seed(col: string, id: string, doc: Doc): void;
}

export function createFakeFirestore(): FakeFirestore {
  const store = new Map<string, Map<string, Doc>>();
  let auto = 0;

  const colMap = (col: string) => {
    let m = store.get(col);
    if (!m) {
      m = new Map();
      store.set(col, m);
    }
    return m;
  };

  const applySet = (col: string, id: string, value: Doc, opts?: { merge?: boolean }) => {
    const prev = colMap(col).get(id);
    colMap(col).set(id, opts?.merge && prev ? { ...prev, ...value } : { ...value });
  };
  const applyUpdate = (col: string, id: string, value: Doc) => {
    colMap(col).set(id, { ...(colMap(col).get(id) ?? {}), ...value });
  };

  const makeRef = (col: string, id: string): Ref => {
    const ref: Ref = {
      col,
      id,
      get: async () => {
        const d = colMap(col).get(id);
        return { exists: d !== undefined, id, ref, data: () => (d ? { ...d } : undefined) };
      },
      set: async (value, opts) => applySet(col, id, value, opts),
      update: async (value) => applyUpdate(col, id, value),
    };
    return ref;
  };

  interface Query {
    __query: true;
    col: string;
    filters: Array<[string, unknown]>;
    max: number;
    where(field: string, op: string, value: unknown): Query;
    limit(n: number): Query;
    get(): Promise<ReturnType<typeof runQuery>>;
  }

  const makeQuery = (col: string, filters: Array<[string, unknown]>, max = Infinity): Query => ({
    __query: true,
    col,
    filters,
    max,
    where: (field, _op, value) => makeQuery(col, [...filters, [field, value]], max),
    limit: (n) => makeQuery(col, filters, n),
    get: async () => runQuery(makeQuery(col, filters, max)),
  });

  const runQuery = (q: { col: string; filters: Array<[string, unknown]>; max: number }) => {
    const docs = [...colMap(q.col).entries()]
      .filter(([, d]) => q.filters.every(([f, v]) => d[f] === v))
      .slice(0, q.max)
      .map(([id, d]) => ({ id, ref: makeRef(q.col, id), data: () => ({ ...d }) }));
    return {
      empty: docs.length === 0,
      docs,
      forEach: (fn: (d: (typeof docs)[number]) => void) => docs.forEach(fn),
    };
  };

  const db = {
    collection(col: string) {
      return {
        doc: (id?: string): Ref => makeRef(col, id ?? `auto${++auto}`),
        where: (field: string, op: string, value: unknown) => makeQuery(col, []).where(field, op, value),
        limit: (n: number) => makeQuery(col, []).limit(n),
        get: () => makeQuery(col, []).get(),
      };
    },
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const writes: Array<() => void> = [];
      const tx = {
        async get(target: Ref | Query) {
          if ("__query" in target) return runQuery(target);
          return target.get();
        },
        set(ref: Ref, value: Doc, opts?: { merge?: boolean }) {
          writes.push(() => applySet(ref.col, ref.id, value, opts));
        },
        update(ref: Ref, value: Doc) {
          writes.push(() => applyUpdate(ref.col, ref.id, value));
        },
      };
      const result = await fn(tx);
      writes.forEach((w) => w());
      return result;
    },
  };

  return {
    db,
    all: (col) => colMap(col),
    seed: (col, id, doc) => {
      colMap(col).set(id, doc);
    },
  };
}
