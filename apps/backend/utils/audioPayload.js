// The one shape a client-recorded audio payload may take, and the one gate it
// passes to be stored. Extracted from utils/threshold.js when Synthesis became
// the second writer (D20) — the allowlist is a security control (a stored url
// is played on a page other people load), so it lives once, not per app.
//
// SUFFIX match on the blob host, so a new store id needs no backend change —
// same control as utils/memories.js.

function normalizeAudio(audio) {
  const url = String(audio.url || '').trim();
  if (!url) throw new Error('Audio needs a url');

  const suffix = process.env.BLOB_HOST_SUFFIX || '.public.blob.vercel-storage.com';
  let host;
  let urlPath = '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('bad protocol');
    host = parsed.hostname;
    urlPath = parsed.pathname.replace(/^\/+/, '');
  } catch {
    throw new Error('That audio url is not valid');
  }
  if (!host.endsWith(suffix)) throw new Error('That audio url is not an allowed host');

  return {
    url,
    // Stored, not derived at restore time — the store id lives in the hostname,
    // so a restore into a new store needs the key independently of the url.
    pathname: String(audio.pathname || urlPath),
    contentType: String(audio.contentType || ''),
    durationMs: Number(audio.durationMs) || 0,
    peaks: Array.isArray(audio.peaks) ? audio.peaks.slice(0, 200).map(Number) : [],
    sizeBytes: Number(audio.sizeBytes) || 0,
  };
}

module.exports = { normalizeAudio };
