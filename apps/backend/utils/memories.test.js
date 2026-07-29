const { test } = require('node:test');
const assert = require('node:assert/strict');

const memories = require('./memories');

// In-memory store implementing the funnel's data-access surface — same pattern
// as utils/synNodes.test.js and utils/synIdeas.test.js. This
// exercises the REAL funnel functions (tag dedupe, useCount deltas, thread
// flattening, the blob allowlist) with no MongoDB, no Vercel Blob, and no
// Deepgram, which is why this file runs in milliseconds and offline.
function memStore(seedTags = []) {
  const tags = [...seedTags];
  const rows = [];
  // Anchored to real now so the edit window (which compares against
  // Date.now()) behaves, but monotonic so ordering is deterministic.
  let clock = Date.now();
  let frozen = false;
  // Submission times are assigned here rather than taken from the funnel, so
  // ordering assertions are deterministic. freeze() pins the clock to
  // reproduce the same-millisecond collision the keyset cursor exists for.
  const tick = () => new Date(frozen ? clock : (clock += 1000));

  const applyPatch = (doc, patch) => {
    for (const [k, v] of Object.entries(patch)) {
      if (k.includes('.')) {
        // Mirror Mongo's dotted-path set — attachTranscript uses one.
        const parts = k.split('.');
        let cur = doc;
        for (const p of parts.slice(0, -1)) cur = (cur[p] = cur[p] || {});
        cur[parts[parts.length - 1]] = v;
      } else {
        doc[k] = v;
      }
    }
  };

  return {
    _tags: tags,
    _rows: rows,
    _tag: (label) => tags.find(t => t.label === label),
    _freeze: () => { frozen = true; },

    async getInstance(instanceId) { return { id: instanceId, config: {} }; },

    async listTags() { return tags.map(t => ({ ...t })); },
    async findTagByKey(instanceId, set, key) {
      return tags.find(t => t.instanceId === instanceId && t.set === set && t.key === key) || null;
    },
    async createTag(fields) {
      const doc = { ...fields };
      tags.push(doc);
      return { ...doc };
    },
    async bumpTagUse(instanceId, tagIds, delta) {
      for (const t of tags) {
        if (t.instanceId === instanceId && tagIds.includes(t.id)) t.useCount = (t.useCount || 0) + delta;
      }
    },
    async setTagHidden(instanceId, tagId, hidden) {
      const t = tags.find(x => x.instanceId === instanceId && x.id === tagId);
      if (t) t.hidden = hidden;
      return t || null;
    },

    async createMemory(fields) {
      const doc = { ...fields, createdAt: tick() };
      rows.push(doc);
      return { ...doc };
    },
    async findMemory(instanceId, id) {
      const doc = rows.find(r => r.instanceId === instanceId && r.id === id);
      return doc ? { ...doc } : null;
    },
    async updateMemory(instanceId, id, patch) {
      const doc = rows.find(r => r.instanceId === instanceId && r.id === id);
      if (!doc) return null;
      applyPatch(doc, patch);
      doc.updatedAt = tick();
      return { ...doc };
    },
    // Mirrors the real store's generic keyset: compare on the active sort's
    // keys in order, each with its own direction.
    async listMemories(instanceId, { tagIds, cursor, limit, statuses, sort }) {
      const spec = memories.SORTS[memories.sortSpec(sort)];
      const valueOf = (row, key) => (key === 'createdAt' ? Number(row.createdAt) : row[key]);
      const cmp = (a, b) => {
        for (let i = 0; i < spec.keys.length; i++) {
          const k = spec.keys[i];
          const av = valueOf(a, k);
          const bv = valueOf(b, k);
          if (av !== bv) return (av < bv ? -1 : 1) * spec.dirs[i];
        }
        return 0;
      };
      const afterCursor = (row) => {
        if (!cursor) return true;
        for (let i = 0; i < spec.keys.length; i++) {
          const k = spec.keys[i];
          const rv = valueOf(row, k);
          const cv = k === 'createdAt' ? Number(cursor[k]) : cursor[k];
          if (rv !== cv) return spec.dirs[i] < 0 ? rv < cv : rv > cv;
        }
        return false;   // identical to the cursor row itself
      };
      return rows
        .filter(r => r.instanceId === instanceId && statuses.includes(r.status))
        .filter(r => !tagIds?.length || tagIds.every(t => (r.allTags || []).includes(t)))
        .filter(afterCursor)
        .sort(cmp)
        .slice(0, limit)
        .map(r => ({ ...r }));
    },
    async listThread(instanceId, threadId, statuses) {
      return rows
        .filter(r => r.instanceId === instanceId && r.threadId === threadId && statuses.includes(r.status))
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(r => ({ ...r }));
    },
    async countMemories(instanceId, { tagIds, statuses }) {
      return rows
        .filter(r => r.instanceId === instanceId && statuses.includes(r.status))
        .filter(r => !tagIds?.length || tagIds.every(t => (r.allTags || []).includes(t)))
        .length;
    },
    async findManyByIds(instanceId, ids) {
      return rows
        .filter(r => r.instanceId === instanceId && ids.includes(r.id))
        .map(r => ({ id: r.id, title: r.title, sharerName: r.sharerName }));
    },
    async countThreadSiblings(instanceId, threadIds, statuses) {
      const by = new Map();
      for (const r of rows) {
        if (r.instanceId !== instanceId || !threadIds.includes(r.threadId)) continue;
        if (!statuses.includes(r.status)) continue;
        by.set(r.threadId, (by.get(r.threadId) || 0) + 1);
      }
      return [...by].map(([_id, count]) => ({ _id, count }));
    },
  };
}

const INST = 'mem-ellen';
const base = (store, over = {}) => ({
  store,
  instanceId: INST,
  contributorId: 'contrib-1',
  title: 'The kitchen radio',
  sharerName: 'Ruth',
  subjectTagLabels: ['stubborn'],
  selfTagLabels: ['the new kid'],
  experienceTagLabels: ['being seen'],
  body: { text: 'She left the radio on all night.' },
  ...over,
});

// ── Creation, tags, counts ──────────────────────────────────────────────────

test('createMemory: unions the three slots into allTags and heads its own thread', async () => {
  const store = memStore();
  const m = await memories.createMemory(base(store));

  assert.equal(m.threadId, m.id, 'a standalone memory heads its own thread');
  assert.equal(m.replyToId, null);
  assert.equal(m.status, 'live', 'D3 — live on submit');
  assert.equal(m.body.kind, 'text');
  assert.equal(m.allTags.length, 3);
  for (const id of [...m.subjectTags, ...m.selfTags, ...m.experienceTags]) {
    assert.ok(m.allTags.includes(id), 'every slot tag appears in allTags');
  }
});

test('createMemory: the shared role vocabulary counts a dual-slot tag once', async () => {
  const store = memStore();
  const m = await memories.createMemory(base(store, {
    subjectTagLabels: ['stubborn'],
    selfTagLabels: ['stubborn'],   // both of us were
  }));

  assert.equal(m.allTags.length, 2, 'union is distinct');
  assert.deepEqual(m.subjectTags, m.selfTags, 'both slots resolve to the same tag id');
  assert.equal(store._tag('stubborn').useCount, 1, 'one memory, one use');
});

test('createMemory: tags dedupe on the normalized key across contributors', async () => {
  const store = memStore();
  await memories.createMemory(base(store, { subjectTagLabels: ['In Over My Head'] }));
  await memories.createMemory(base(store, {
    contributorId: 'contrib-2',
    subjectTagLabels: ['  in   over my head  '],
  }));

  const matches = store._tags.filter(t => t.key === 'in over my head');
  assert.equal(matches.length, 1, 'one tag, not two near-duplicates');
  assert.equal(matches[0].useCount, 2);
  assert.equal(matches[0].label, 'In Over My Head', 'first spelling wins for display');
});

test('createMemory: role and experience are separate vocabularies', async () => {
  const store = memStore();
  await memories.createMemory(base(store, {
    subjectTagLabels: ['grief'],
    experienceTagLabels: ['grief'],
  }));
  const matches = store._tags.filter(t => t.key === 'grief');
  assert.equal(matches.length, 2, 'same word in both vocabularies is two tags');
  assert.deepEqual(matches.map(t => t.set).sort(), ['experience', 'role']);
});

test('createMemory: caps how many tags one submission may coin per slot', async () => {
  const store = memStore();
  const m = await memories.createMemory(base(store, {
    subjectTagLabels: ['one', 'two', 'three', 'four'],
  }));
  assert.equal(m.subjectTags.length, memories.NEW_TAGS_PER_SLOT_MAX);
});

test('createMemory: existing tags are never blocked by the coin cap', async () => {
  const store = memStore();
  await memories.createMemory(base(store, { subjectTagLabels: ['one', 'two'] }));
  await memories.createMemory(base(store, { subjectTagLabels: ['three', 'four'] }));
  // All four now exist, so a later memory may use all of them.
  const m = await memories.createMemory(base(store, {
    subjectTagLabels: ['one', 'two', 'three', 'four'],
  }));
  assert.equal(m.subjectTags.length, 4);
});

test('createMemory: a locked vocabulary drops unknown labels instead of minting', async () => {
  const store = memStore();
  await memories.syncSeedTags({ store, instanceId: INST, config: { seedRoleTags: ['patient'] } });
  const m = await memories.createMemory(base(store, {
    subjectTagLabels: ['patient', 'something new'],
    selfTagLabels: [],
    experienceTagLabels: [],
    config: { allowCustomTags: false },
  }));
  assert.equal(m.subjectTags.length, 1);
  assert.equal(store._tags.length, 1, 'nothing was coined');
});

test('syncSeedTags: idempotent, and marks curator seeds as seeded', async () => {
  const store = memStore();
  const config = { seedRoleTags: ['teacher', 'teacher'], seedExperienceTags: ['first jobs'] };
  await memories.syncSeedTags({ store, instanceId: INST, config });
  await memories.syncSeedTags({ store, instanceId: INST, config });

  assert.equal(store._tags.length, 2, 'no duplicates on a second sync');
  assert.ok(store._tags.every(t => t.origin === 'seeded'));
});

// ── Threads ─────────────────────────────────────────────────────────────────

test('createMemory: add-to joins the target thread, and stays flat', async () => {
  const store = memStore();
  const root = await memories.createMemory(base(store, { title: 'The kitchen radio' }));
  const added = await memories.createMemory(base(store, {
    contributorId: 'contrib-2', title: 'The kitchen radio', replyToId: root.id,
  }));
  // Adding to the ADDED memory must land in the same cluster, not nest.
  const third = await memories.createMemory(base(store, {
    contributorId: 'contrib-3', title: 'The kitchen radio', replyToId: added.id,
  }));

  assert.equal(added.threadId, root.id);
  assert.equal(third.threadId, root.id, 'threads never nest — PLAN §3.3');
  assert.equal(third.replyToId, added.id, 'but we remember who it was added to');
});

test('getMemoryWithThread: any member of a thread reveals the whole cluster', async () => {
  const store = memStore();
  const root = await memories.createMemory(base(store));
  const added = await memories.createMemory(base(store, { contributorId: 'c2', replyToId: root.id }));

  const fromLeaf = await memories.getMemoryWithThread({ store, instanceId: INST, id: added.id });
  assert.equal(fromLeaf.memory.id, added.id);
  assert.equal(fromLeaf.thread.length, 1);
  assert.equal(fromLeaf.thread[0].id, root.id, 'opening the added memory shows the original');
  assert.equal(fromLeaf.memory.threadCount, 2);
});

test('getMemoryWithThread: hidden memories are invisible by default, visible to the curator', async () => {
  const store = memStore();
  const root = await memories.createMemory(base(store));
  await memories.setMemoryStatus({ store, instanceId: INST, id: root.id, status: 'hidden', reason: 'spam' });

  assert.equal(await memories.getMemoryWithThread({ store, instanceId: INST, id: root.id }), null);
  const curated = await memories.getMemoryWithThread({
    store, instanceId: INST, id: root.id, includeHidden: true,
  });
  assert.equal(curated.memory.id, root.id);
});

// ── Editing ─────────────────────────────────────────────────────────────────

test('editMemory: moves useCount by the delta, not by rewriting it', async () => {
  const store = memStore();
  const m = await memories.createMemory(base(store, {
    subjectTagLabels: ['stubborn'], selfTagLabels: [], experienceTagLabels: ['being seen'],
  }));
  assert.equal(store._tag('stubborn').useCount, 1);

  await memories.editMemory({
    store, instanceId: INST, id: m.id, contributorId: 'contrib-1',
    subjectTagLabels: ['patient'],
  });

  assert.equal(store._tag('stubborn').useCount, 0, 'dropped tag loses a use');
  assert.equal(store._tag('patient').useCount, 1, 'added tag gains one');
  assert.equal(store._tag('being seen').useCount, 1, 'untouched slot is untouched');
});

test('editMemory: refuses someone else\'s memory, and refuses after the window', async () => {
  const store = memStore();
  const m = await memories.createMemory(base(store));

  await assert.rejects(
    () => memories.editMemory({ store, instanceId: INST, id: m.id, contributorId: 'someone-else', title: 'Mine now' }),
    /Not yours/,
  );
  await assert.rejects(
    () => memories.editMemory({
      store, instanceId: INST, id: m.id, contributorId: 'contrib-1', title: 'Too late',
      now: new Date(m.createdAt).getTime() + memories.EDIT_WINDOW_MS + 1,
    }),
    /no longer be edited/,
  );
});

// ── Moderation ──────────────────────────────────────────────────────────────

test('setMemoryStatus: hiding and unhiding is idempotent in both directions', async () => {
  const store = memStore();
  const m = await memories.createMemory(base(store));
  assert.equal(store._tag('stubborn').useCount, 1);

  await memories.setMemoryStatus({ store, instanceId: INST, id: m.id, status: 'hidden' });
  await memories.setMemoryStatus({ store, instanceId: INST, id: m.id, status: 'hidden' });
  assert.equal(store._tag('stubborn').useCount, 0, 'a double-tapped hide cannot double-decrement');

  await memories.setMemoryStatus({ store, instanceId: INST, id: m.id, status: 'live' });
  await memories.setMemoryStatus({ store, instanceId: INST, id: m.id, status: 'live' });
  assert.equal(store._tag('stubborn').useCount, 1, 'and unhiding restores exactly one');
});

test('flagMemory: counts once per contributor and never auto-hides', async () => {
  const store = memStore();
  const m = await memories.createMemory(base(store));

  for (const c of ['a', 'b', 'c', 'd', 'a']) {
    await memories.flagMemory({ store, instanceId: INST, id: m.id, contributorId: c });
  }
  const after = await store.findMemory(INST, m.id);
  assert.equal(after.flagCount, 4, 'the repeat flag from "a" is ignored');
  assert.equal(after.status, 'live', 'brigading a memorial must not hide it');
});

test('deleteOwnMemory: soft-removes and gives back the tag uses', async () => {
  const store = memStore();
  const m = await memories.createMemory(base(store));
  const gone = await memories.deleteOwnMemory({ store, instanceId: INST, id: m.id, contributorId: 'contrib-1' });

  assert.equal(gone.status, 'removed');
  assert.equal(store._tag('stubborn').useCount, 0);
  assert.ok(store._rows.find(r => r.id === m.id), 'document survives so the thread keeps its shape');
});

// ── Audio ───────────────────────────────────────────────────────────────────

test('assertAllowedAudioUrl: only https on the configured blob host', async () => {
  const ok = 'https://abc123.public.blob.vercel-storage.com/memorial/x/y.webm';
  assert.equal(memories.assertAllowedAudioUrl(ok), ok);

  assert.throws(() => memories.assertAllowedAudioUrl('http://abc.public.blob.vercel-storage.com/a.webm'), /https/);
  assert.throws(() => memories.assertAllowedAudioUrl('https://evil.example.com/a.webm'), /blob host/);
  assert.throws(() => memories.assertAllowedAudioUrl('https://public.blob.vercel-storage.com.evil.com/a.webm'), /blob host/);
  assert.throws(() => memories.assertAllowedAudioUrl('not a url'), /Invalid/);
});

test('normalizeBody: derives kind, and requires an actual story', async () => {
  const audio = { url: 'https://a.public.blob.vercel-storage.com/x.webm', durationMs: 9000 };
  assert.equal(memories.normalizeBody({ text: 'hi' }).kind, 'text');
  assert.equal(memories.normalizeBody({ audio }).kind, 'audio');
  assert.equal(memories.normalizeBody({ text: 'hi', audio }).kind, 'both');

  assert.throws(() => memories.normalizeBody({}), /needs a story/);
  assert.throws(() => memories.normalizeBody({ text: '   ' }), /needs a story/);
});

test('normalizeBody: keeps the client-measured duration and starts audio untranscribed', async () => {
  const body = memories.normalizeBody({
    audio: { url: 'https://a.public.blob.vercel-storage.com/x.m4a', durationMs: 91_000, peaks: [1, 2, 3] },
  });
  assert.equal(body.audio.durationMs, 91_000, 'iOS mp4 has no duration metadata — we trust the client timer');
  assert.equal(body.audio.transcript.status, 'skipped');
});

test('attachTranscript: fills the transcript without touching anything else', async () => {
  const store = memStore();
  const m = await memories.createMemory(base(store, {
    body: { audio: { url: 'https://a.public.blob.vercel-storage.com/x.webm', durationMs: 5000 } },
  }));
  await memories.attachTranscript({ store, instanceId: INST, id: m.id, text: 'She left the radio on.' });

  const after = await store.findMemory(INST, m.id);
  assert.equal(after.body.audio.transcript.text, 'She left the radio on.');
  assert.equal(after.body.audio.transcript.status, 'ready');
  assert.equal(after.body.audio.url, m.body.audio.url, 'audio itself is untouched');
});

test('attachTranscript: a late callback for a deleted memory is not an error', async () => {
  const store = memStore();
  assert.equal(await memories.attachTranscript({ store, instanceId: INST, id: 'gone', text: 'x' }), null);
});

// ── Serialization ───────────────────────────────────────────────────────────

test('toClient: never leaks the contributor identity, the IP hash, or the flaggers', async () => {
  const store = memStore();
  const m = await memories.createMemory(base(store, { ipHash: 'deadbeef' }));
  await memories.flagMemory({ store, instanceId: INST, id: m.id, contributorId: 'nosy' });

  const { memory: wire } = await memories.getMemoryWithThread({ store, instanceId: INST, id: m.id });
  const json = JSON.stringify(wire);
  assert.ok(!('contributorId' in wire));
  assert.ok(!('ipHash' in wire));
  assert.ok(!('flaggerIds' in wire));
  assert.ok(!json.includes('contrib-1') && !json.includes('deadbeef') && !json.includes('nosy'));
});

test('toClient: isMine is true only for the asking contributor', async () => {
  const store = memStore();
  const m = await memories.createMemory(base(store));

  const mine = await memories.getMemoryWithThread({ store, instanceId: INST, id: m.id, contributorId: 'contrib-1' });
  const theirs = await memories.getMemoryWithThread({ store, instanceId: INST, id: m.id, contributorId: 'contrib-9' });
  const anon = await memories.getMemoryWithThread({ store, instanceId: INST, id: m.id });
  assert.equal(mine.memory.isMine, true);
  assert.equal(theirs.memory.isMine, false);
  assert.equal(anon.memory.isMine, false);
});

test('toClient: an empty sharer name surfaces as anonymous', async () => {
  const store = memStore();
  const m = await memories.createMemory(base(store, { sharerName: '   ' }));
  const { memory: wire } = await memories.getMemoryWithThread({ store, instanceId: INST, id: m.id });
  assert.equal(wire.anonymous, true);
  assert.equal(wire.sharerName, '');
});

test('toClient: a retired tag stops rendering but does not break its memories', async () => {
  const store = memStore();
  const m = await memories.createMemory(base(store));
  await memories.setTagHidden({ store, instanceId: INST, tagId: store._tag('stubborn').id, hidden: true });

  const { memory: wire } = await memories.getMemoryWithThread({ store, instanceId: INST, id: m.id });
  assert.equal(wire.subjectTags.length, 0, 'retired tag drops out of display');
  assert.equal(wire.experienceTags.length, 1, 'the rest of the memory is intact');

  const picker = await memories.listTags({ store, instanceId: INST });
  assert.ok(!picker.role.some(t => t.label === 'stubborn'), 'and out of the picker');
});

// ── The wall ────────────────────────────────────────────────────────────────

test('listWall: newest first, cursor-paginated, with thread sizes', async () => {
  const store = memStore();
  const root = await memories.createMemory(base(store, { title: 'A' }));
  await memories.createMemory(base(store, { title: 'B', replyToId: root.id }));
  await memories.createMemory(base(store, { title: 'C' }));

  const page1 = await memories.listWall({ store, instanceId: INST, limit: 2 });
  assert.deepEqual(page1.memories.map(m => m.title), ['C', 'B']);
  assert.ok(page1.nextCursor, 'more to come');
  assert.equal(page1.memories.find(m => m.title === 'B').threadCount, 2);
  assert.equal(page1.memories.find(m => m.title === 'C').threadCount, 1);

  const page2 = await memories.listWall({ store, instanceId: INST, limit: 2, cursor: page1.nextCursor });
  assert.deepEqual(page2.memories.map(m => m.title), ['A']);
  assert.equal(page2.nextCursor, null);
});

test('listWall: an addition carries its parent, so the wall can say what it was added to', async () => {
  const store = memStore();
  const root = await memories.createMemory(base(store, { title: 'The garden', sharerName: 'Ruth' }));
  await memories.createMemory(base(store, {
    contributorId: 'c2', title: 'The garden', sharerName: 'Marcus', replyToId: root.id,
  }));

  const { memories: wall } = await memories.listWall({ store, instanceId: INST });
  const addition = wall.find(m => m.sharerName === 'Marcus');
  const original = wall.find(m => m.sharerName === 'Ruth');

  assert.equal(addition.replyTo.id, root.id);
  assert.equal(addition.replyTo.title, 'The garden');
  assert.equal(addition.replyTo.sharerName, 'Ruth');
  assert.equal(original.replyTo, null, 'an original memory has no parent');
});

test('listWall: total counts every match, not just the page', async () => {
  const store = memStore();
  for (const title of ['A', 'B', 'C', 'D', 'E']) {
    await memories.createMemory(base(store, { title }));
  }
  const hidden = await memories.createMemory(base(store, { title: 'F' }));
  await memories.setMemoryStatus({ store, instanceId: INST, id: hidden.id, status: 'hidden' });

  const page = await memories.listWall({ store, instanceId: INST, limit: 2 });
  assert.equal(page.memories.length, 2);
  assert.equal(page.total, 5, 'total spans every page and excludes hidden rows');
});

test('listWall: paging never drops a memory that ties on createdAt', async () => {
  const store = memStore();
  store._freeze();   // every memory lands in the same millisecond
  for (const title of ['A', 'B', 'C', 'D']) {
    await memories.createMemory(base(store, { title }));
  }

  const seen = [];
  let cursor = null;
  do {
    const page = await memories.listWall({ store, instanceId: INST, limit: 2, cursor });
    seen.push(...page.memories.map(m => m.title));
    cursor = page.nextCursor;
  } while (cursor);

  assert.deepEqual(seen.sort(), ['A', 'B', 'C', 'D'], 'all four survive the page boundary');
  assert.equal(new Set(seen).size, 4, 'and none is repeated');
});

test('listWall: filtering on a role tag finds it in either role slot', async () => {
  const store = memStore();
  await memories.createMemory(base(store, {
    title: 'She was', subjectTagLabels: ['stubborn'], selfTagLabels: [], experienceTagLabels: [],
  }));
  await memories.createMemory(base(store, {
    title: 'I was', subjectTagLabels: [], selfTagLabels: ['stubborn'], experienceTagLabels: [],
  }));
  await memories.createMemory(base(store, {
    title: 'Neither', subjectTagLabels: ['patient'], selfTagLabels: [], experienceTagLabels: [],
  }));

  const stubborn = store._tag('stubborn').id;
  const { memories: found } = await memories.listWall({ store, instanceId: INST, tagIds: [stubborn] });
  assert.deepEqual(found.map(m => m.title).sort(), ['I was', 'She was'],
    'the shared role vocabulary is the point — PLAN §2.1');
});

test('listWall: multiple tag filters narrow (AND), and hidden rows stay off the wall', async () => {
  const store = memStore();
  await memories.createMemory(base(store, {
    title: 'Both', subjectTagLabels: ['stubborn'], selfTagLabels: [], experienceTagLabels: ['being seen'],
  }));
  await memories.createMemory(base(store, {
    title: 'One', subjectTagLabels: ['stubborn'], selfTagLabels: [], experienceTagLabels: [],
  }));
  const hidden = await memories.createMemory(base(store, {
    title: 'Hidden', subjectTagLabels: ['stubborn'], selfTagLabels: [], experienceTagLabels: ['being seen'],
  }));
  await memories.setMemoryStatus({ store, instanceId: INST, id: hidden.id, status: 'hidden' });

  const ids = [store._tag('stubborn').id, store._tag('being seen').id];
  const { memories: found } = await memories.listWall({ store, instanceId: INST, tagIds: ids });
  assert.deepEqual(found.map(m => m.title), ['Both']);

  const curated = await memories.listWall({ store, instanceId: INST, tagIds: ids, includeHidden: true });
  assert.deepEqual(curated.memories.map(m => m.title).sort(), ['Both', 'Hidden']);
});

// ── Sorting ─────────────────────────────────────────────────────────────────

test('listWall: oldest reverses the wall', async () => {
  const store = memStore();
  for (const title of ['A', 'B', 'C']) await memories.createMemory(base(store, { title }));

  const newest = await memories.listWall({ store, instanceId: INST });
  const oldest = await memories.listWall({ store, instanceId: INST, sort: 'oldest' });

  assert.deepEqual(newest.memories.map(m => m.title), ['C', 'B', 'A']);
  assert.deepEqual(oldest.memories.map(m => m.title), ['A', 'B', 'C']);
  assert.equal(oldest.sort, 'oldest', 'the response says which ordering it used');
});

test('listWall: connected puts the biggest thread first', async () => {
  const store = memStore();
  const lonely = await memories.createMemory(base(store, { title: 'Lonely' }));
  const busy = await memories.createMemory(base(store, { title: 'Busy' }));
  for (const who of ['c2', 'c3']) {
    await memories.createMemory(base(store, { title: 'Busy', contributorId: who, replyToId: busy.id }));
  }

  const { memories: wall } = await memories.listWall({ store, instanceId: INST, sort: 'connected' });
  assert.equal(wall[0].threadCount, 3, 'a three-memory thread outranks a lone one');
  assert.equal(wall[wall.length - 1].id, lonely.id);
  // Every member of the big thread carries the count, not just the original.
  assert.deepEqual(wall.slice(0, 3).map(m => m.threadCount), [3, 3, 3]);
});

test('syncThreadCount: hiding and restoring moves the whole thread', async () => {
  const store = memStore();
  const root = await memories.createMemory(base(store, { title: 'Root' }));
  const added = await memories.createMemory(base(store, { contributorId: 'c2', replyToId: root.id }));

  const countOf = async (id) => (await store.findMemory(INST, id)).threadCount;
  assert.equal(await countOf(root.id), 2);

  await memories.setMemoryStatus({ store, instanceId: INST, id: added.id, status: 'hidden' });
  assert.equal(await countOf(root.id), 1, 'hiding a member shrinks the count for everyone');

  await memories.setMemoryStatus({ store, instanceId: INST, id: added.id, status: 'live' });
  assert.equal(await countOf(root.id), 2, 'restoring puts it back');

  await memories.deleteOwnMemory({ store, instanceId: INST, id: added.id, contributorId: 'c2' });
  assert.equal(await countOf(root.id), 1, 'a withdrawal counts too');
});

test('listWall: every sort paginates without dropping or repeating a memory', async () => {
  for (const sort of Object.keys(memories.SORTS)) {
    const store = memStore();
    // A mix of thread sizes so `connected` has real ties to break.
    const roots = [];
    for (const title of ['A', 'B', 'C', 'D', 'E']) {
      roots.push(await memories.createMemory(base(store, { title })));
    }
    await memories.createMemory(base(store, { contributorId: 'c2', replyToId: roots[1].id }));
    await memories.createMemory(base(store, { contributorId: 'c3', replyToId: roots[1].id }));
    await memories.createMemory(base(store, { contributorId: 'c4', replyToId: roots[3].id }));

    const seen = [];
    let cursor = null;
    let guard = 0;
    do {
      const page = await memories.listWall({ store, instanceId: INST, sort, limit: 2, cursor });
      seen.push(...page.memories.map(m => m.id));
      cursor = page.nextCursor;
    } while (cursor && ++guard < 20);

    assert.equal(seen.length, 8, `${sort}: every memory appears`);
    assert.equal(new Set(seen).size, 8, `${sort}: none appears twice`);
  }
});

test('listWall: a cursor from another sort is ignored rather than obeyed', async () => {
  const store = memStore();
  for (const title of ['A', 'B', 'C']) await memories.createMemory(base(store, { title }));

  const newest = await memories.listWall({ store, instanceId: INST, limit: 1 });
  // Replaying a `newest` cursor under `oldest` would otherwise page from the
  // wrong end and silently hide most of the wall.
  const crossed = await memories.listWall({
    store, instanceId: INST, sort: 'oldest', cursor: newest.nextCursor,
  });
  assert.deepEqual(crossed.memories.map(m => m.title), ['A', 'B', 'C'], 'falls back to page one');
});

test('listWall: an unknown sort falls back to the default', async () => {
  const store = memStore();
  for (const title of ['A', 'B']) await memories.createMemory(base(store, { title }));
  const page = await memories.listWall({ store, instanceId: INST, sort: 'sideways' });
  assert.equal(page.sort, memories.DEFAULT_SORT);
  assert.deepEqual(page.memories.map(m => m.title), ['B', 'A']);
});

test('listWall: never crosses memorials', async () => {
  const store = memStore();
  await memories.createMemory(base(store, { title: 'Ellen' }));
  await memories.createMemory(base(store, { instanceId: 'mem-ray', title: 'Ray' }));

  const { memories: found } = await memories.listWall({ store, instanceId: INST });
  assert.deepEqual(found.map(m => m.title), ['Ellen']);
});
