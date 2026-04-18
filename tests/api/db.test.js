function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createInMemorySupabase(seed = {}) {
  const tables = {
    bst_classes: clone(seed.bst_classes || []),
    bst_lesson_plans: clone(seed.bst_lesson_plans || []),
    bst_notes: clone(seed.bst_notes || []),
    bst_app_data_history: clone(seed.bst_app_data_history || [])
  };

  const applyFilters = (rows, filters) => {
    return rows.filter((row) => filters.every((filter) => {
      if (filter.type === 'eq') {
        return row[filter.field] === filter.value;
      }
      if (filter.type === 'in') {
        return Array.isArray(filter.values) && filter.values.includes(row[filter.field]);
      }
      if (filter.type === 'contains') {
        const rowValue = row[filter.field];
        if (!Array.isArray(rowValue) || !Array.isArray(filter.values)) return false;
        return filter.values.every((value) => rowValue.includes(value));
      }
      return true;
    }));
  };

  class Query {
    constructor(tableName) {
      this.tableName = tableName;
      this.filters = [];
      this.orders = [];
      this.limitValue = null;
      this.selectFields = null;
      this.selectOptions = {};
      this.operation = 'select';
      this.deleteOptions = {};
    }

    select(fields, options = {}) {
      this.operation = 'select';
      this.selectFields = fields;
      this.selectOptions = options || {};
      return this;
    }

    eq(field, value) {
      this.filters.push({ type: 'eq', field, value });
      return this;
    }

    in(field, values) {
      this.filters.push({ type: 'in', field, values });
      return this;
    }

    contains(field, values) {
      this.filters.push({ type: 'contains', field, values });
      return this;
    }

    order(field, options = {}) {
      this.orders.push({ field, ascending: options.ascending !== false });
      return this;
    }

    limit(count) {
      this.limitValue = count;
      return this;
    }

    delete(options = {}) {
      this.operation = 'delete';
      this.deleteOptions = options;
      return this;
    }

    async upsert(payload, options = {}) {
      const rows = tables[this.tableName] || [];
      const next = Array.isArray(payload) ? payload : [payload];
      const key = String(options.onConflict || '').trim();

      if (!key) {
        next.forEach((row) => rows.push(clone(row)));
      } else {
        next.forEach((incoming) => {
          const index = rows.findIndex((row) => row[key] === incoming[key]);
          if (index >= 0) {
            rows[index] = clone({ ...rows[index], ...incoming });
          } else {
            rows.push(clone(incoming));
          }
        });
      }

      tables[this.tableName] = rows;
      return { data: null, error: null };
    }

    async insert(payload) {
      const rows = tables[this.tableName] || [];
      rows.push(clone(payload));
      tables[this.tableName] = rows;
      return { data: null, error: null };
    }

    async execute() {
      const rows = tables[this.tableName] || [];

      if (this.operation === 'delete') {
        const filtered = applyFilters(rows, this.filters);
        const deletedIds = new Set(filtered.map((row) => row));
        const kept = rows.filter((row) => !deletedIds.has(row));
        tables[this.tableName] = kept;
        return {
          data: null,
          error: null,
          count: this.deleteOptions?.count === 'exact' ? filtered.length : null
        };
      }

      let selected = applyFilters(rows, this.filters).map((row) => clone(row));

      this.orders.forEach(({ field, ascending }) => {
        selected.sort((a, b) => {
          if (a[field] === b[field]) return 0;
          if (a[field] === undefined) return 1;
          if (b[field] === undefined) return -1;
          return a[field] > b[field] ? (ascending ? 1 : -1) : (ascending ? -1 : 1);
        });
      });

      if (Number.isInteger(this.limitValue)) {
        selected = selected.slice(0, this.limitValue);
      }

      if (typeof this.selectFields === 'string' && this.selectFields !== '*') {
        const fields = this.selectFields
          .split(',')
          .map((field) => field.trim())
          .filter(Boolean);

        selected = selected.map((row) => {
          const next = {};
          fields.forEach((field) => {
            next[field] = row[field];
          });
          return next;
        });
      }

      if (this.selectOptions?.head) {
        return { data: null, error: null, count: selected.length };
      }

      return { data: selected, error: null };
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  }

  return {
    from(tableName) {
      if (!tables[tableName]) {
        tables[tableName] = [];
      }
      return new Query(tableName);
    },
    dump(tableName) {
      return clone(tables[tableName] || []);
    }
  };
}

describe('db Supabase normalized storage behavior', () => {
  let dbModule;
  let dbPath;

  beforeEach(async () => {
    vi.resetModules();

    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    const fakeSupabase = createInMemorySupabase();

    const supabasePath = require.resolve('@supabase/supabase-js');
    delete require.cache[supabasePath];
    require.cache[supabasePath] = {
      id: supabasePath,
      filename: supabasePath,
      loaded: true,
      exports: {
        createClient: () => fakeSupabase
      }
    };

    dbPath = require.resolve('../../db');
    delete require.cache[dbPath];
    dbModule = require('../../db');
  });

  afterEach(async () => {
    if (dbModule?.closeDB) {
      await dbModule.closeDB();
    }

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (dbPath) {
      delete require.cache[dbPath];
    }

    vi.resetModules();
  });

  it('connects and saves/loads normalized class documents', async () => {
    const connected = await dbModule.connectDB();
    expect(connected).toBe(true);

    const saved = await dbModule.saveDoc('classes', {
      classes: [
        { id: 'class-1', title: 'Class 1' },
        { id: 'class-2', title: 'Class 2' }
      ]
    });
    expect(saved).toBe(true);

    const loaded = await dbModule.loadDoc('classes');
    expect(Array.isArray(loaded.classes)).toBe(true);
    expect(loaded.classes.map((item) => item.id)).toEqual(['class-1', 'class-2']);
  });

  it('removes deleted class references from lesson plans', async () => {
    await dbModule.connectDB();

    await dbModule.upsertLessonPlanRecord('plan-linked', {
      id: 'plan-linked',
      title: 'Linked Plan',
      classes: ['class-1', 'class-2']
    });

    await dbModule.upsertClassRecord('class-1', { id: 'class-1', title: 'Class 1' });
    await dbModule.upsertClassRecord('class-2', { id: 'class-2', title: 'Class 2' });

    const deleted = await dbModule.deleteClassRecord('class-1');
    expect(deleted).toBe(true);

    const lessonPlans = await dbModule.loadDoc('lessonPlans');
    const linkedPlan = lessonPlans.lessonPlans.find((plan) => plan.id === 'plan-linked');

    expect(linkedPlan).toBeTruthy();
    expect(linkedPlan.classes).toEqual(['class-2']);
  });

  it('returns false when Supabase credentials are missing', async () => {
    await dbModule.closeDB();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    vi.resetModules();
    const freshDbPath = require.resolve('../../db');
    delete require.cache[freshDbPath];
    dbModule = require('../../db');

    const connected = await dbModule.connectDB();
    expect(connected).toBe(false);
    expect(dbModule.isConnected()).toBe(false);
  });
});
