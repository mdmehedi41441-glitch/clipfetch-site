const express = require('express');
const path = require('path');
const dns = require('node:dns/promises');
const net = require('node:net');
const app = express();
const PORT = process.env.PORT || 3000;
const MAX_BYTES = 1024 * 1024 * 1024; // 1 GiB safety limit

app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    p[0] >= 224;
}
function isPrivateIPv6(ip) {
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80:') || x.startsWith('::ffff:127.') || x.startsWith('::ffff:10.') || x.startsWith('::ffff:192.168.');
}
async function assertPublicHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) throw new Error('Private network URLs are not allowed.');
  if (net.isIP(h)) {
    if ((net.isIPv4(h) && isPrivateIPv4(h)) || (net.isIPv6(h) && isPrivateIPv6(h))) throw new Error('Private network URLs are not allowed.');
    return;
  }
  const records = await dns.lookup(h, { all: true });
  if (!records.length || records.some(r => (net.isIPv4(r.address) && isPrivateIPv4(r.address)) || (net.isIPv6(r.address) && isPrivateIPv6(r.address)))) throw new Error('This host does not resolve to a public address.');
}
function parseDirectVideoUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('Enter a valid video-file URL.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only HTTP and HTTPS links are supported.');
  if (u.username || u.password) throw new Error('URLs containing embedded credentials are not supported.');
  const pathname = u.pathname.toLowerCase();
  if (!/\.(mp4|webm|mov|m4v|ogv|mkv)$/.test(pathname)) throw new Error('This starter supports direct video-file links ending in .mp4, .webm, .mov, .m4v, .ogv, or .mkv. For other sites, add an authorized platform adapter.');
  return u;
}

app.post('/api/inspect', async (req, res) => {
  try {
    const u = parseDirectVideoUrl(String(req.body?.url || '').trim());
    await assertPublicHost(u.hostname);
    const response = await fetch(u, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (response.status >= 300 && response.status < 400) return res.status(400).json({ error: 'Redirected video URLs are not supported in this starter. Use the final direct media URL.' });
    if (!response.ok) return res.status(400).json({ error: `The source returned HTTP ${response.status}. It may require sign-in or may block direct downloads.` });
    const type = response.headers.get('content-type') || '';
    const length = Number(response.headers.get('content-length') || 0);
    if (type && !type.startsWith('video/') && type !== 'application/octet-stream') return res.status(400).json({ error: 'The URL does not appear to point to a video file.' });
    if (length > MAX_BYTES) return res.status(413).json({ error: 'The video is larger than this demo server’s 1 GiB limit.' });
    res.json({ title: decodeURIComponent(path.basename(u.pathname)), format: path.extname(u.pathname).slice(1).toUpperCase(), sizeBytes: length || null, quality: 'Source quality', message: 'This is a direct file link. The server cannot create 1080p if the source file is lower resolution.' });
  } catch (e) { res.status(400).json({ error: e.message || 'Could not inspect this URL.' }); }
});

app.get('/api/download', async (req, res) => {
  let u;
  try {
    u = parseDirectVideoUrl(String(req.query.url || '').trim());
    await assertPublicHost(u.hostname);
    const upstream = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    if (upstream.status >= 300 && upstream.status < 400) return res.status(400).send('Redirected video URLs are not supported. Use the final direct media URL.');
    if (!upstream.ok || !upstream.body) return res.status(400).send(`The source returned HTTP ${upstream.status}.`);
    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    if (!type.startsWith('video/') && type !== 'application/octet-stream') { await upstream.body.cancel(); return res.status(400).send('The URL did not return a video file.'); }
    const size = Number(upstream.headers.get('content-length') || 0);
    if (size > MAX_BYTES) { await upstream.body.cancel(); return res.status(413).send('Video exceeds the 1 GiB demo limit.'); }
    const filename = path.basename(u.pathname).replace(/[^a-zA-Z0-9._-]/g, '_') || 'video.mp4';
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (size) res.setHeader('Content-Length', String(size));
    const reader = upstream.body.getReader();
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) { res.destroy(new Error('Download size limit exceeded')); await reader.cancel(); break; }
        if (!res.write(Buffer.from(value))) await new Promise(resolve => res.once('drain', resolve));
      }
      if (!res.destroyed) res.end();
    } catch (e) { if (!res.destroyed) res.destroy(e); }
  } catch (e) { if (!res.headersSent) res.status(400).send(e.message || 'Download failed.'); else res.destroy(); }
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`ClipFetch running at http://localhost:${PORT}`));
