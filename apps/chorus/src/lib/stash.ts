import { createStash } from '@hs/audio';

// Chorus's recording stash.
//
// The database name is 'chorus' and MUST STAY 'chorus'. It is the name the app
// wrote under before the recorder moved into @hs/audio, so keeping it is what
// makes the extraction invisible: a recording already sitting on somebody's
// phone — one whose upload failed, which is the entire reason the stash
// exists — is still found and handed back on their next visit. Renaming it
// would orphan exactly the recordings the feature was built to rescue.
//
// The scope passed to write/read is the memorial slug, because one deployment
// serves every memorial and a recording made for one family must never
// resurface in another family's compose sheet.
export const recordingStash = createStash({ dbName: 'chorus' });
