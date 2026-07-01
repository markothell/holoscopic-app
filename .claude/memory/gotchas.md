# Gotchas

## 1. Never use `findById()` or `_id` in queries

All models have a custom `id: String` field. MongoDB's auto-generated `_id` is never used in the application layer. If you write `Model.findById(req.params.id)`, you'll always get null.

```js
// WRONG
await Activity.findById(req.params.id);

// RIGHT
await Activity.findOne({ id: req.params.id });
```

---

## 2. Activity envelope vs plain object responses

Activities routes return `{ success: true, data: activity }`. All other routes (topics, sequences, algorithms, instances) return plain objects like `{ topic }` or `{ sequence }`. Mixing these in a new route or client will break the consumer. Check which pattern the route file already uses before adding to it.

---

## 3. API routes are not loaded until MongoDB connects

If you restart the server and MongoDB is slow or unavailable, `loadAPIRoutes()` never fires and all `/api/*` paths return 404. The `/health` endpoint exposes `"apiRoutesLoaded": false` in this state. Do not confuse this for a routing bug.

---

## 4. Activity and Sequence have no instanceId — queries must NOT filter by it

These models are global. If you add `instanceId: req.instanceId` to an `Activity.find()` query, you'll return zero results because the field doesn't exist on the documents.

---

## 5. activityType legacy names in the database

Old activities in MongoDB may have `activityType: 'holoscopic'` or `activityType: 'findthecenter'`. The frontend normalizes these, but the backend still stores and echoes whatever is in the document. Any server-side code that switches on `activityType` must normalize first, or add cases for both old and new names.

---

## 6. WebSocket path skips some validations that REST enforces

In `websocket-server.js`, the `submit_rating` handler does NOT check solo tracker mode, maxEntries limits, or participant membership. The REST endpoint `POST /api/activities/:id/rating` does all of these. If you add a new validation rule to the REST path, check whether it also needs to appear in the WebSocket handler.

---

## 7. `addRating` is multi-step and uses retry logic — do not simplify it

The `Activity.addRating()` method does THREE sequential `findOneAndUpdate` calls (to remove old votes, update vote counts, then add the new rating). This is intentional to handle concurrent WebSocket and REST submissions. Replacing it with a simpler `$push` will cause `VersionError` conflicts under concurrent load.

---

## 8. Starter data userId/username pattern

Activities can have seed entries with `userId: 'starter_<objectId>_<index>'` and `username: 'Example Data'`. The `POST /:id/sync-starter-data` route identifies and strips these by both patterns. If you create real participants whose IDs start with `starter_`, they will be deleted when the facilitator resyncs starter data.

---

## 9. Snapshot `slotNumber` means question index, not extra entry

For `activityType === 'snapshot'`, `slotNumber` is used to identify which question the rating/comment belongs to, NOT to represent additional entries per user. The maxEntries slot validation is skipped for snapshot type. A snapshot user has one slot per question, not one slot per `maxEntries` value.

---

## 10. `sweepQuorum` in topics can trigger Holon rewards during a GET request

When `GET /api/topics` is called and a topic has just reached quorum, `sweepQuorum()` will:
1. Update the topic status to `confirmed`
2. Call `transact()` to award `topicQuorumReward` Holons to the nominator
3. Call `notify()` to create a Notification document for the nominator

This is a write-heavy side effect on a read endpoint. Under high concurrency, two simultaneous GETs could both try to confirm the same topic. The status check `status: 'nominated'` in the sweep query provides some protection, but it's not atomic.

---

## 11. Platform app uses localStorage auth, not NextAuth

`apps/platform` stores the auth user in `localStorage` via its own `AuthContext`. It does NOT use NextAuth. `apps/holoscopic-game` uses NextAuth. Do not mix these patterns — importing `useSession` from `next-auth/react` in the platform app will fail.

---

## 12. Tailwind v4 in the game app requires `@source` in globals.css

The game app uses Tailwind v4. The `@source` directive in `globals.css` must include the path to `packages/activities/src` so Tailwind scans the shared component library for class names. If you add new Tailwind classes in the activities package and they don't appear in the game, check whether the `@source` glob covers the new file path.

---

## 13. The `id` field in Activity is also the Socket.IO room name

When clients call `socket.join(activityId)` and `io.to(activityId).emit(...)`, the `activityId` is the custom `id` field, not the MongoDB `_id`. If you ever change how activity IDs are generated, you'll break WebSocket room targeting.

---

## 14. `maxEntries: 0` is the special solo tracker mode flag

`maxEntries: 0` means unlimited entries for the creator only. It is NOT the same as "no entry limit for everyone". The valid values accepted by the backend are `[0, 1, 2, 4]`. Any other value is rejected silently (reverts to default 1).
