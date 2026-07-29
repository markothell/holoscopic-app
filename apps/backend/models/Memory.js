const mongoose = require('mongoose');

// Memory — the one content model for Chorus, an app for collecting memories
// about a single person. One document per story somebody left about the
// memorial's subject.
//
// WHY NOT `Entry`: the root CLAUDE.md makes Entry the source of truth for
// participation content, but Entry's shape is position/text/votes — a map
// coordinate with a comment. A memory carries audio, a transcript, three tag
// slots, and an ANONYMOUS author with no User document at all. Forcing it into
// Entry would mean four new optional subdocuments on the repo's hottest
// collection. Same call Synthesis made with SynNode; Entry is untouched here.
//
// THE PROMPT is a sentence with three blanks, filled from TWO vocabularies
// (see MemoryTag): "This is a story where <Name> was ___ and I was ___ having
// an experience of ___." The first two blanks share the `role` vocabulary on
// purpose — filtering on "stubborn" then surfaces every story where *somebody*
// was stubborn, whichever side of it the sharer was on.
//
// AUTHORSHIP is anonymous by design (PLAN §5, D2). `contributorId` is a
// server-minted browser identity that buys exactly two things — the right to
// edit/delete your own memory, and throttling. It is NOT authentication, it
// does not survive a cleared browser, and it is stripped from every
// client-facing projection. `sharerName` is free text the sharer typed;
// empty string means they chose "anon", which must stay as easy as typing a
// name or the people who feel they don't belong in the story won't post.
//
// Instance-scoped like every other multi-tenant document: one Chorus instance
// is one memorial for one person. Nothing here assumes that stays true — when
// this becomes a widget in the community app, many memorials coexist as child
// instances and this model does not change (PLAN §11).
const audioSchema = new mongoose.Schema({
  // Vercel Blob public URL. Validated server-side against an allowlisted host
  // in utils/memories.js so a client can't point a memory at arbitrary remote
  // audio. Blob URLs are public but unguessable — correct for a public wall.
  url:       { type: String, default: '' },
  pathname:  { type: String, default: '' },  // memorial/<instanceId>/<memoryId>.<ext>
  mimeType:  { type: String, default: '' },  // webm/opus, or mp4/aac on iOS
  sizeBytes: { type: Number, default: 0 },

  // Measured CLIENT-side with a timer, never read back off the file: iOS
  // Safari's MediaRecorder routinely writes mp4 with no duration metadata,
  // which renders as an un-scrubbable Infinity in the player (PLAN §6.4).
  durationMs: { type: Number, default: 0 },

  // ~64 amplitude samples taken off an AnalyserNode while recording. Free to
  // capture, and it's most of what makes the player feel designed.
  peaks: { type: [Number], default: [] },

  // Deepgram fills this asynchronously via callback. Fire-and-forget, exactly
  // like Synthesis's index hooks: with no DEEPGRAM_API_KEY the status stays
  // 'skipped' and the app degrades cleanly — audio still plays, it just isn't
  // readable or searchable. Transcription must never fail a submission.
  transcript: {
    text:      { type: String, default: '' },
    status:    { type: String, enum: ['pending', 'ready', 'failed', 'skipped'], default: 'skipped' },
    provider:  { type: String, default: '' },
    updatedAt: { type: Date,   default: null },
  },
}, { _id: false });

const memorySchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  instanceId: { type: String, required: true, index: true }, // the memorial

  title:      { type: String, required: true, trim: true, maxlength: 80 },
  // '' means anonymous. Rendered as "Anonymous"; never backfilled.
  sharerName: { type: String, trim: true, maxlength: 60, default: '' },
  // Anonymous browser identity. NEVER returned to clients — see toClient().
  contributorId: { type: String, required: true, index: true },

  // The three prompt slots. Values are MemoryTag ids. subjectTags and selfTags
  // both draw from the `role` vocabulary; experienceTags from `experience`.
  subjectTags:    { type: [String], default: [] },
  selfTags:       { type: [String], default: [] },
  experienceTags: { type: [String], default: [] },
  // Denormalized union of the three, purely so tag filtering is one multikey
  // index scan instead of a three-way $or. Written by the funnel only — same
  // trick as Entry.voterIds.
  allTags:        { type: [String], default: [] },

  body: {
    kind: { type: String, enum: ['text', 'audio', 'both'], required: true },
    text: { type: String, default: '', maxlength: 5000 },
    audio: { type: audioSchema, default: () => ({}) },
  },

  // Threads (PLAN §3.3). "Add to this memory" can only ever attach to an
  // EXISTING memory — it can never merge two established threads — so a flat
  // threadId is sufficient and correct: the whole cluster is one indexed
  // query, membership is transitive for free, and a cycle is unrepresentable.
  // Standalone memories carry their own id here.
  threadId:  { type: String, required: true, index: true },
  replyToId: { type: String, default: null },  // for "added to Ray's memory"

  // How many LIVE memories share this thread, including this one. Denormalized
  // onto every member rather than aggregated per request, because the wall's
  // "most connected" sort has to be a plain indexed sort — a computed count
  // can't participate in the keyset cursor, and sorting on it any other way
  // would mean loading the whole wall to order it. Maintained only by
  // utils/memories.js#syncThreadCount, which runs on every create, status
  // change, and withdrawal.
  threadCount: { type: Number, default: 1 },

  // Live on submit, curator removes (D3). 'hidden' retains the document so it
  // stays recoverable and the thread keeps its shape; 'removed' is the hard
  // case and is curator-only.
  status:       { type: String, enum: ['live', 'hidden', 'removed'], default: 'live', index: true },
  hiddenReason: { type: String, default: '' },

  // Visitor reports. Surfaces a memory at the top of the curator queue but
  // NEVER auto-hides it: brigading a memorial is easier than moderating one.
  flagCount:  { type: Number, default: 0 },
  flaggerIds: { type: [String], default: [] },  // contributorIds, dedupe only

  // Salted hash for abuse throttling. Never a raw IP — a memorial collects
  // stories from people who have no account and no expectation of being
  // logged.
  ipHash: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { id: false });

// The wall: newest live memories for this memorial, cursor-paginated.
// The trailing `id` is required, not decorative: SORTS.newest is
// {createdAt:-1, id:-1} and SORTS.oldest is {createdAt:1, id:1}, so an index
// stopping at createdAt leaves a blocking in-memory sort. Direction must
// match too — {createdAt:-1, id:1} would NOT serve either ordering, while
// this one serves `newest` forward and `oldest` walking backwards.
memorySchema.index({ instanceId: 1, status: 1, createdAt: -1, id: -1 });
// Tag filtering across all three slots at once.
memorySchema.index({ instanceId: 1, allTags: 1 });
// A whole thread in one query.
memorySchema.index({ instanceId: 1, threadId: 1 });
// The "most connected" sort, and its keyset cursor — same trailing-id rule.
memorySchema.index({ instanceId: 1, status: 1, threadCount: -1, createdAt: -1, id: -1 });
// "Your memories" + ownership checks on edit/delete.
memorySchema.index({ instanceId: 1, contributorId: 1 });

memorySchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.Memory || mongoose.model('Memory', memorySchema);
