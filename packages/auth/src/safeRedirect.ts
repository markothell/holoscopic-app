// Where a credential form is allowed to send somebody afterwards.
//
// Every login and signup page in the monorepo reads a ?next= / ?callbackUrl=
// and hands it to router.push() or signIn({ callbackUrl }). Unchecked, that
// forwards a freshly-authenticated account to whatever origin an attacker
// names — a phishing hop from a real domain, moments after a password was
// typed into it. Same-origin paths only; everything else becomes the caller's
// own fallback.
//
// This ships as `@hs/auth/redirect` and is deliberately NOT re-exported from
// the package barrel: the barrel pulls next-auth's server configuration, and
// every caller of this function is a 'use client' page that must not drag
// that into the browser bundle.
//
// It was ten copies before it was one function, and all ten shared the same
// hole. That is what safeRedirect.test.mjs is for — the vectors there are the
// specification, not decoration.

/** C0 controls and DEL. Written as codepoints rather than a regex class
 *  because the escape sequences for these are exactly the thing that gets
 *  mistyped, and a wrong one here fails open. */
function isControl(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code <= 0x1f || code === 0x7f;
}

/**
 * Reduce a caller-supplied redirect target to a path on this origin.
 *
 * @param raw       the untrusted value, e.g. `searchParams.get('next')`
 * @param fallback  where to go instead — a literal path the caller owns
 * @returns a same-origin path, never a URL that can leave this origin
 */
export function safeRedirect(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;

  // Control characters come off FIRST. URL parsing drops tab, LF and CR
  // wherever they sit, so "/<TAB>/evil.com" — which arrives as the entirely
  // ordinary-looking ?next=%2F%09%2Fevil.com and is decoded by
  // searchParams.get() into a real tab — sails past a leading-"//" check and
  // then resolves to https://evil.com the moment the router parses it.
  //
  // The stripped value is what gets returned, too: testing a cleaned string
  // and then handing back the dirty one guards nothing.
  const path = Array.from(raw).filter(ch => !isControl(ch)).join('');

  // A leading "//" or "/\" makes it scheme-relative — the browser reads what
  // follows as a HOST rather than a path. Anything not starting with "/" is
  // either absolute (https://…) or carries another scheme (javascript:, data:).
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) {
    return fallback;
  }

  return path;
}
