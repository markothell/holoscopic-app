# Code Patterns

## Backend: Route with Holon spend + notify

The standard pattern for an action that costs Holons and should notify the actor:

```js
router.post('/nominate', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { instanceId } = req;
    const config = req.instance.config;

    await spend({ userId, instanceId, type: 'nomination_cost', amount: config.holons.nominationCost, refType: 'topic' });

    const doc = new Topic({ id: generateId(), instanceId, /* ... */ });
    await doc.save();

    res.status(201).json({ topic: doc.toJSON() });
  } catch (err) {
    res.status(err.message === 'Insufficient Holons' ? 402 : 500).json({ error: err.message });
  }
});
```

Key points: 402 for insufficient Holons, spend before persisting the primary document.

---

## Backend: Instance-scoped model query

```js
const docs = await Topic.find({ instanceId: req.instanceId, status: 'nominated' }).sort({ expiresAt: 1 });
```

Always include `instanceId` in the filter for `Topic`, `Algorithm`, `AlgorithmProposal`, `HolonTransaction`.

---

## Backend: ID generation

```js
// Short random string (used by most models)
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

// UUID-based (used by Activity and Sequence)
id: { default: () => require('crypto').randomUUID().substring(0, 8) }
```

Both produce ~8-character alphanumeric strings. Use `generateId()` for new documents unless the model already uses `crypto.randomUUID()`.

---

## Backend: WebSocket broadcast after REST mutation

```js
// After mutating the activity document, notify all connected clients:
if (io && updatedComment) {
  io.to(req.params.id).emit('comment_voted', { comment: updatedComment });
}
```

`req.params.id` is the activity's custom `id` field, which is also the Socket.IO room name.

---

## Frontend: Consuming the activity registry

```tsx
import { REGISTRY, normalizeActivityType } from '@hs/activities';

const type = normalizeActivityType(activity.activityType); // always normalize first
const { PositioningSteps, Results, totalSteps } = REGISTRY[type];

return <PositioningSteps activity={activity} currentStep={step} onComplete={handleDone} />;
```

---

## Frontend: Instance config access

```tsx
import { useInstance } from '@/contexts/InstanceContext';

function MyComponent() {
  const { config } = useInstance();
  // config.holons.nominationCost, config.quorum.topicSupportThreshold, etc.
}
```

Read Holon costs and quorum thresholds from the instance context, never hardcode them.

---

## Frontend: API calls with user identity

```ts
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const { userId } = useAuth();

// GET (no userId needed for public endpoints)
const data = await apiFetch('/topics');

// POST with user identity
const result = await apiFetch('/topics/nominate', {
  method: 'POST',
  userId,        // → x-user-id header
  body: JSON.stringify({ title, description, whyItMatters }),
});
```

---

## Backend: Sweep-on-read pattern (topics)

```js
router.get('/', async (req, res) => {
  const config = req.instance.config;
  await sweepExpired(instanceId, config);  // write side effect on read
  await sweepQuorum(instanceId, config);   // write side effect on read
  const docs = await Topic.find({ instanceId, status });
  // ...
});
```

This runs on every topic GET. It is intentional — no background job runs these sweeps.

---

## Models: Virtuals and toJSON

Some models expose virtuals:
```js
topicSchema.set('toJSON', { virtuals: true });
topicSchema.virtual('supporterCount').get(function () { return this.supporters.length; });
```

Call `.toJSON()` (not `.toObject()`) when you need virtuals included in the response.

---

## Sequence: Round visibility

```js
// Set a round hidden (participants can't see it until revealed)
await sequence.setRoundVisibility(roundNumber, true);

// When serving to participants, always filter hidden rounds:
const hiddenRoundNums = new Set(sequence.rounds.filter(r => r.hidden).map(r => r.number));
const visibleActivities = activitiesWithDetails.filter(a => !hiddenRoundNums.has(a.round ?? 1));
```

Admin/manage endpoints skip this filter; participant-facing endpoints always apply it.
