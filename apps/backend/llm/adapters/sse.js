// Minimal SSE line reader over a fetch() response body. Both the Anthropic
// Messages stream and the OpenAI-compatible /chat/completions stream are
// Server-Sent Events; this yields the raw `data:` payload strings, and each
// adapter parses its own JSON shape out of them. No dependency — Node 18+
// ships global fetch and a web ReadableStream body.

async function* readDataLines(response) {
  if (!response.body) return;
  const decoder = new TextDecoder();
  let buffer = '';
  // response.body is a web ReadableStream in Node 18+ (async-iterable).
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      if (line.startsWith('data:')) {
        yield line.slice(5).trim();
      }
    }
  }
  const tail = buffer.trim();
  if (tail.startsWith('data:')) yield tail.slice(5).trim();
}

module.exports = { readDataLines };
