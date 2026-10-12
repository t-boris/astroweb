/**
 * Minimal in-memory stand-in for the parts of the Firestore Admin SDK that the
 * wallet and stats code uses: collections, docs, equality `where`, and
 * transactions (reads first, writes applied on commit).
 */
type Doc = Record<string, unknown>;

interface Ref {
  col: string;
  id: string;
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

  const snapshot = (ref: Ref) => {
    const d = colMap(ref.col).get(ref.id);
    return { exists: d !== undefined, id: ref.id, ref, data: () => (d ? { ...d } : undefined) };
  };

  const makeQuery = (col: string, filters: Array<[string, unknown]>) => ({
    __query: true as const,
    col,
    filters,
    where(field: string, _op: string, value: unknown) {
      return makeQuery(col, [...filters, [field, value]]);
    },
  });

  const runQuery = (q: { col: string; filters: Array<[string, unknown]> }) => {
    const docs = [...colMap(q.col).entries()]
      .filter(([, d]) => q.filters.every(([f, v]) => d[f] === v))
      .map(([id, d]) => ({ id, ref: { col: q.col, id } as Ref, data: () => ({ ...d }) }));
    return { empty: docs.length === 0, docs, forEach: (fn: (d: (typeof docs)[number]) => void) => docs.forEach(fn) };
  };

  const db = {
    collection(col: string) {
      return {
        doc(id?: string): Ref {
          return { col, id: id ?? `auto${++auto}` };
        },
        where(field: string, op: string, value: unknown) {
          return makeQuery(col, []).where(field, op, value);
        },
      };
    },
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const writes: Array<() => void> = [];
      const tx = {
        async get(target: Ref | { __query: true; col: string; filters: Array<[string, unknown]> }) {
          return "__query" in target ? runQuery(target) : snapshot(target);
        },
        set(ref: Ref, value: Doc, opts?: { merge?: boolean }) {
          writes.push(() => {
            const prev = colMap(ref.col).get(ref.id);
            colMap(ref.col).set(ref.id, opts?.merge && prev ? { ...prev, ...value } : { ...value });
          });
        },
        update(ref: Ref, value: Doc) {
          writes.push(() => {
            const prev = colMap(ref.col).get(ref.id) ?? {};
            colMap(ref.col).set(ref.id, { ...prev, ...value });
          });
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
