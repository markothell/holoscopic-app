// The redirect guard's specification, written as attacks.
//
// Run with `npm test --workspace=packages/auth`. Node strips the TypeScript
// types on import, so this needs no build step (same arrangement as
// packages/audio/src/recorder.test.mjs).
//
// These tests exercise the FULL browser chain rather than the function alone:
//
//   attacker's link -> URL parsing -> searchParams.get() (percent-DECODES)
//     -> safeRedirect() -> router.push() / signIn({ callbackUrl }) -> resolve
//
// That matters. An earlier version of this guard passed every test anyone
// thought to write against the raw string and still forwarded to evil.com,
// because the percent-decoding step in the middle turns %09 into a real tab
// and URL resolution at the end throws that tab away — revealing a "//" the
// prefix check had already approved. A test that skips the chain cannot see
// that bug.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { safeRedirect } from './safeRedirect.ts';

const SITE = 'https://synthesis.holoscopic.io';
const FALLBACK = '/dashboard';

/** Walk one attacker-supplied query value through the whole chain and report
 *  the origin the browser would actually land on. */
function landsOn(encodedParamValue) {
  const link = `${SITE}/login?next=${encodedParamValue}`;
  const decoded = new URL(link).searchParams.get('next');
  const target = safeRedirect(decoded, FALLBACK);
  return { target, origin: new URL(target, SITE).origin };
}

// --- the payloads that must never leave the origin -------------------------

const ATTACKS = [
  ['%2F%2Fevil.com', 'scheme-relative //evil.com'],
  ['%2F%2F%2Fevil.com', 'triple slash'],
  ['https%3A%2F%2Fevil.com', 'absolute https url'],
  ['%2F%5Cevil.com', 'backslash — IE/WHATWG treats it as a slash'],
  ['%2F%5C%2Fevil.com', 'backslash then slash'],
  ['%2F%09%2Fevil.com', 'encoded TAB then // — stripped by URL parsing'],
  ['%2F%0A%2Fevil.com', 'encoded LF then //'],
  ['%2F%0D%2Fevil.com', 'encoded CR then //'],
  ['%2F%00%2F%2Fevil.com', 'encoded NUL then //'],
  ['%09%2F%2Fevil.com', 'leading TAB before //'],
  ['javascript%3Aalert(1)', 'javascript: scheme'],
  ['data%3Atext%2Fhtml%2Cx', 'data: scheme'],
];

for (const [payload, label] of ATTACKS) {
  test(`refuses: ${label}`, () => {
    const { target, origin } = landsOn(payload);
    assert.equal(
      origin, SITE,
      `payload ?next=${payload} resolved to ${origin} via ${JSON.stringify(target)}`,
    );
    assert.equal(target, FALLBACK, 'a refused target falls back rather than being patched up');
  });
}

// --- the ordinary traffic that must keep working ---------------------------

const ALLOWED = [
  ['%2Fdashboard', '/dashboard'],
  ['%2F', '/'],
  ['%2Fme%3Fx%3D1', '/me?x=1'],
  ['%2Fa%2Fb%23c', '/a/b#c'],
  ['%2Fideas%2FDEMO', '/ideas/DEMO'],
  ['%2F%25E2%2598%2585', '/%E2%98%85'],
];

for (const [payload, expected] of ALLOWED) {
  test(`allows: ${expected}`, () => {
    const { target, origin } = landsOn(payload);
    assert.equal(target, expected);
    assert.equal(origin, SITE);
  });
}

// --- the empty cases -------------------------------------------------------

test('a missing, empty or null value takes the fallback', () => {
  assert.equal(safeRedirect(null, FALLBACK), FALLBACK);
  assert.equal(safeRedirect(undefined, FALLBACK), FALLBACK);
  assert.equal(safeRedirect('', FALLBACK), FALLBACK);
});

test('a value that is nothing but control characters takes the fallback', () => {
  // Strips to '', which is not a path — must not become the origin root by
  // accident, and must not be returned as an empty push target.
  const onlyControls = String.fromCharCode(9, 10, 13, 0);
  assert.equal(safeRedirect(onlyControls, FALLBACK), FALLBACK);
});

test('control characters are removed from an otherwise legitimate path', () => {
  const withTab = '/dash' + String.fromCharCode(9) + 'board';
  assert.equal(safeRedirect(withTab, FALLBACK), '/dashboard');
});

// --- the regression this file exists for -----------------------------------

test('REGRESSION: the cleaned value is what gets returned, not the raw one', () => {
  // The original bug: a guard may test a stripped string and then hand back
  // the dirty original, so the caller pushes "/<TAB>//evil.com" anyway.
  const payload = '/' + String.fromCharCode(9) + '/evil.com';
  const out = safeRedirect(payload, FALLBACK);
  assert.ok(
    !Array.from(out).some(ch => ch.charCodeAt(0) <= 0x1f),
    'the returned value still carried a control character',
  );
  assert.equal(new URL(out, SITE).origin, SITE);
});
