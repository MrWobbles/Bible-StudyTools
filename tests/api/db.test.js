function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMatcher(filter) {
  return (doc) => {
    const entries = Object.entries(filter || {});
    return entries.every(([key, expected]) => {
      const actual = doc[key];

      if (expected && typeof expected === 'object' && !Array.isArray(expected) && '$nin' in expected) {
        return !expected.$nin.includes(actual);
      }

      if (Array.isArray(actual)) {
        return actual.includes(expected);
      }

      return actual === expected;
    });
  };
}

function createInMemoryMongo(seed = {}) {
  const collections = new Map();

  Object.entries(seed).forEach(([name, docs]) => {
    collections.set(name, deepClone(Array.isArray(docs) ? docs : []));
  });

  function getCollectionDocs(name) {
    if (!collections.has(name)) {
      collections.set(name, []);
    }
    return collections.get(name);
  }

  class Cursor {
    constructor(docs) {
      this.docs = docs;
    }

    sort(spec = {}) {
      const [[field, direction]] = Object.entries(spec);
      const dir = Number(direction) >= 0 ? 1 : -1;
      this.docs.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        if (aVal === bVal) return 0;
        return aVal > bVal ? dir : -dir;
      });
      return this;
    }

    limit(count) {
      this.docs = this.docs.slice(0, count);
      return this;
    }

    async toArray() {
      return deepClone(this.docs);
    }
  }

  class Collection {
    constructor(name) {
      this.name = name;
    }

    async createIndex() {
      return undefined;
    }

    async countDocuments(filter = {}) {
      const docs = getCollectionDocs(this.name);
      return docs.filter(createMatcher(filter)).length;
    }

    async findOne(filter = {}) {
      const docs = getCollectionDocs(this.name);
      const found = docs.find(createMatcher(filter));
      return found ? deepClone(found) : null;
    }

    find(filter = {}) {
      const docs = getCollectionDocs(this.name).filter(createMatcher(filter));
      return new Cursor(deepClone(docs));
    }

    async bulkWrite(operations = []) {
      for (const operation of operations) {
        if (operation.replaceOne) {
          const { filter, replacement, upsert } = operation.replaceOne;
          await this.replaceOne(filter, replacement, { upsert: !!upsert });
        }
      }
      return { ok: 1 };
    }

    async replaceOne(filter = {}, replacement = {}, options = {}) {
      const docs = getCollectionDocs(this.name);
      const matcher = createMatcher(filter);
      const index = docs.findIndex(matcher);
      const replacementClone = deepClone(replacement);

      if (index >= 0) {
        docs[index] = replacementClone;
        return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
      }

      if (options.upsert) {
        docs.push(replacementClone);
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }

      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }

    async deleteMany(filter = {}) {
      const docs = getCollectionDocs(this.name);
      const matcher = createMatcher(filter);
      let deletedCount = 0;

      for (let index = docs.length - 1; index >= 0; index -= 1) {
        if (matcher(docs[index])) {
          docs.splice(index, 1);
          deletedCount += 1;
        }
      }

      return { deletedCount };
    }

    async deleteOne(filter = {}) {
      const docs = getCollectionDocs(this.name);
      const matcher = createMatcher(filter);
      const index = docs.findIndex(matcher);
      if (index >= 0) {
        docs.splice(index, 1);
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    }

    async insertOne(document = {}) {
      const docs = getCollectionDocs(this.name);
      docs.push(deepClone(document));
      return { acknowledged: true };
    }
  }

  class InMemoryDB {
    collection(name) {
      return new Collection(name);
    }

    async command() {
      return { ok: 1 };
    }
  }

  return {
    db: new InMemoryDB(),
    dump(name) {
      return deepClone(getCollectionDocs(name));
    }
  };
}

describe('db normalized storage behavior', () => {
  let dbModule;
  let mongo;
  let mongodbPath;
  let dbPath;

  beforeEach(async () => {
    process.env.MONGODB_URI = 'mongodb://unit-test-host:27017';
    process.env.MONGODB_DB_NAME = 'bible-study-test';

    mongo = createInMemoryMongo({
      appData: [
        {
          _id: 'classes',
          classes: [
            { id: 'class-1', title: 'Migrated Class 1' },
            { id: 'class-2', title: 'Migrated Class 2' }
          ]
        },
        {
          _id: 'lessonPlans',
          lessonPlans: [
            { id: 'plan-1', title: 'Migrated Plan', classes: ['class-1', 'class-2'] }
          ]
        }
      ]
    });

    class FakeMongoClient {
      async connect() {
        return this;
      }

      db() {
        return mongo.db;
      }

      async close() {
        return undefined;
      }
    }

    vi.resetModules();

    mongodbPath = require.resolve('mongodb');
    delete require.cache[mongodbPath];
    require.cache[mongodbPath] = {
      id: mongodbPath,
      filename: mongodbPath,
      loaded: true,
      exports: {
        MongoClient: FakeMongoClient
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

    delete process.env.MONGODB_URI;
    delete process.env.MONGODB_DB_NAME;

    if (dbPath) {
      delete require.cache[dbPath];
    }
    if (mongodbPath) {
      delete require.cache[mongodbPath];
    }

    vi.resetModules();
  });

  it('migrates legacy appData into normalized collections on connect', async () => {
    const connected = await dbModule.connectDB();
    expect(connected).toBe(true);

    const classesData = await dbModule.loadDoc('classes');
    const lessonPlansData = await dbModule.loadDoc('lessonPlans');

    expect(classesData.classes.map((item) => item.id)).toEqual(['class-1', 'class-2']);
    expect(lessonPlansData.lessonPlans.map((item) => item.id)).toEqual(['plan-1']);

    const history = mongo.dump('appDataHistory');
    expect(history.some((entry) => entry.reason === 'legacy-migration')).toBe(true);
  });

  it('removes deleted class references from lesson plans', async () => {
    await dbModule.connectDB();

    await dbModule.upsertLessonPlanRecord('plan-linked', {
      id: 'plan-linked',
      title: 'Linked Plan',
      classes: ['class-1', 'class-2']
    });

    const deleted = await dbModule.deleteClassRecord('class-1');
    expect(deleted).toBe(true);

    const lessonPlans = await dbModule.loadDoc('lessonPlans');
    const linkedPlan = lessonPlans.lessonPlans.find((plan) => plan.id === 'plan-linked');

    expect(linkedPlan).toBeTruthy();
    expect(linkedPlan.classes).toEqual(['class-2']);
  });
});
