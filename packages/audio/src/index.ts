// @hs/audio — browser voice capture and playback, shared by every app in this
// repo that records.
//
// What is here: the browser's quirks. Format detection, timed duration, peak
// resampling, the IndexedDB stash, the single shared <audio> element.
//
// What is deliberately NOT here: markup, CSS classes, and copy. Each app has
// its own hand-styled visual language and its own voice, so the recorder UI and
// the player chrome stay in the app and drive `useRecorder` / `usePlayer`.
//
// Extracted from apps/chorus (2026-08-05). See apps/threshold/PLAN.md §7.

export {
  canRecord,
  pickMimeType,
  baseMimeType,
  fileExtensionFor,
  formatDuration,
  resamplePeaks,
  createStash,
  type Recording,
  type Stash,
  type StashOptions,
} from './recorder';

export {
  useRecorder,
  type RecorderState,
  type RecorderErrorCode,
  type UseRecorderOptions,
  type UseRecorderResult,
} from './useRecorder';

export { default as PlayerProvider, usePlayer } from './PlayerProvider';
