'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const { PassThrough } = require('node:stream');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

function get(port, route, token) {
  return new Promise((resolve, reject) => {
    http.get({
      host: '127.0.0.1',
      port,
      path: route,
      headers: { 'X-Riff-Token': token }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let data;
        try { data = JSON.parse(body); } catch (_) { data = body; }
        resolve({ status: res.statusCode, data });
      });
    }).on('error', reject);
  });
}

test('Spotify embed AST extraction: varied JSON formats, HTML entities, and malformed inputs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raser-challenger-spotify-'));
  const oldDataDir = process.env.RASER_DATA_DIR;
  const oldGet = https.get;
  let server;
  let mockEmbedResponse = { status: 200, body: '' };

  const reply = (callback, status, body) => {
    const res = new PassThrough();
    res.statusCode = status;
    res.headers = {};
    process.nextTick(() => {
      callback(res);
      res.end(body);
    });
    return res;
  };

  try {
    process.env.RASER_DATA_DIR = dir;
    https.get = (url, options, callback) => {
      const u = new URL(url);
      if (u.hostname === 'open.spotify.com') {
        return reply(callback, mockEmbedResponse.status, mockEmbedResponse.body);
      }
      throw new Error(`Unexpected HTTPS request to: ${url}`);
    };

    server = require('../../src/server/server');
    const port = await server.startServer(0);
    const token = server.getServerToken();

    const playlistId = '37i9dQZF1DXcBWIGoYBM5M';
    const importUrl = `/api/spotify-import?url=https://open.spotify.com/playlist/${playlistId}`;

    // --- Scenario 1: Standard __NEXT_DATA__ extraction with trackList and totalCount ---
    const payload1 = {
      props: {
        pageProps: {
          state: {
            data: {
              entity: {
                name: 'Rock Classics',
                totalCount: 1,
                trackList: [
                  {
                    title: 'Back In Black',
                    subtitle: 'AC/DC',
                    uri: 'spotify:track:08mG3Y1vljYA6bvNXEsIqN',
                    duration: 255000,
                    image: 'https://i.scdn.co/image/ab67616d0000b273b'
                  }
                ]
              }
            }
          }
        }
      }
    };
    mockEmbedResponse = {
      status: 200,
      body: `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload1)}</script></head><body></body></html>`
    };
    let res = await get(port, importUrl, token);
    assert.strictEqual(res.status, 200, 'Scenario 1 should succeed');
    assert.strictEqual(res.data.name, 'Rock Classics');
    assert.strictEqual(res.data.tracks.length, 1);
    assert.strictEqual(res.data.tracks[0].title, 'Back In Black');
    assert.strictEqual(res.data.tracks[0].artist, 'AC/DC');
    assert.strictEqual(res.data.tracks[0].duration, 255);
    assert.strictEqual(res.data.tracks[0].spotifyId, '08mG3Y1vljYA6bvNXEsIqN');

    // --- Scenario 2: HTML-entity encoded JSON in __NEXT_DATA__ ---
    const rawJson2 = JSON.stringify({
      props: {
        pageProps: {
          entity: {
            name: "Tom & Jerry's Hits",
            totalCount: 1,
            trackList: [
              {
                title: "Rock & Roll <All Nite>",
                subtitle: "KISS",
                uri: "spotify:track:40riOy7x9W7GXjyGp4pjAv",
                duration_ms: 170000
              }
            ]
          }
        }
      }
    });
    const htmlEncodedJson2 = rawJson2
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;');

    mockEmbedResponse = {
      status: 200,
      body: `<html><script id="__NEXT_DATA__">${htmlEncodedJson2}</script></html>`
    };
    res = await get(port, importUrl, token);
    assert.strictEqual(res.status, 200, 'Scenario 2 (HTML entities) should succeed');
    assert.strictEqual(res.data.name, "Tom & Jerry's Hits");
    assert.strictEqual(res.data.tracks.length, 1);
    assert.strictEqual(res.data.tracks[0].title, 'Rock & Roll <All Nite>');
    assert.strictEqual(res.data.tracks[0].artist, 'KISS');
    assert.strictEqual(res.data.tracks[0].duration, 170);

    // --- Scenario 3: Multiple application/json scripts where earlier ones have no tracks ---
    const telemetryJson = JSON.stringify({ telemetry: { client: 'embed', session: 'xyz' } });
    const payload3 = {
      pageProps: {
        entity: {
          name: 'Multi-Script Playlist',
          totalCount: 1,
          trackList: [
            {
              uri: 'spotify:track:5QO792alvyvHIneGgaCDmK',
              title: 'Yellow Submarine',
              subtitle: 'The Beatles',
              duration_ms: 158000
            }
          ]
        }
      }
    };
    mockEmbedResponse = {
      status: 200,
      body: `
        <html>
          <script type="application/json">${telemetryJson}</script>
          <script type="application/json">${JSON.stringify({ config: { env: 'prod' } })}</script>
          <script type="application/json">${JSON.stringify(payload3)}</script>
        </html>
      `
    };
    res = await get(port, importUrl, token);
    assert.strictEqual(res.status, 200, 'Scenario 3 (multi application/json) should succeed');
    assert.strictEqual(res.data.name, 'Multi-Script Playlist');
    assert.strictEqual(res.data.tracks.length, 1);
    assert.strictEqual(res.data.tracks[0].title, 'Yellow Submarine');
    assert.strictEqual(res.data.tracks[0].artist, 'The Beatles');

    // --- Scenario 4: Inline regex fallback when script id tag is omitted ---
    const payload4 = {
      pageProps: {
        entity: {
          name: 'Inline Regex Playlist',
          totalCount: 1,
          trackList: [
            {
              uri: 'spotify:track:3n3Ppam7vgaVa1iaRUc9Lp',
              title: 'Mr. Brightside',
              subtitle: 'The Killers',
              duration: 222000
            }
          ]
        }
      }
    };
    mockEmbedResponse = {
      status: 200,
      body: `<html><head><script>window.__PRELOADED_STATE__ = ${JSON.stringify(payload4)};</script></head></html>`
    };
    res = await get(port, importUrl, token);
    assert.strictEqual(res.status, 200, 'Scenario 4 (inline fallback regex) should succeed');
    assert.strictEqual(res.data.name, 'Inline Regex Playlist');
    assert.strictEqual(res.data.tracks[0].title, 'Mr. Brightside');

    // --- Scenario 5: Malformed / Unparseable JSON ---
    mockEmbedResponse = {
      status: 200,
      body: `<html><script id="__NEXT_DATA__">{"props": { unclosed_bracket </script></html>`
    };
    res = await get(port, importUrl, token);
    assert.strictEqual(res.status, 403, 'Malformed JSON should return 403');
    assert.strictEqual(res.data.success, false);
    assert.match(res.data.error, /Could not parse playlist/i);

    // --- Scenario 6: HTTP 404 / 403 / 429 error statuses from Spotify upstream ---
    mockEmbedResponse = { status: 404, body: 'Not Found' };
    res = await get(port, importUrl, token);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.data.code, 'spotify_not_found');

    mockEmbedResponse = { status: 403, body: 'Forbidden' };
    res = await get(port, importUrl, token);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.code, 'spotify_forbidden');

    mockEmbedResponse = { status: 429, body: 'Too Many Requests' };
    res = await get(port, importUrl, token);
    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.data.code, 'spotify_rate_limited');

    // --- Scenario 7: Incomplete playlist enforcement ---
    // If totalCount > trackList.length, 409 spotify_incomplete is returned
    const incompletePayload = {
      pageProps: {
        entity: {
          name: 'Partial Playlist',
          totalCount: 50,
          trackList: [
            {
              uri: 'spotify:track:08mG3Y1vljYA6bvNXEsIqN',
              title: 'Sample Track',
              subtitle: 'Sample Artist'
            }
          ]
        }
      }
    };
    mockEmbedResponse = {
      status: 200,
      body: `<html><script id="__NEXT_DATA__">${JSON.stringify(incompletePayload)}</script></html>`
    };
    res = await get(port, importUrl, token);
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.data.code, 'spotify_incomplete');

    // --- Scenario 8: Invalid URL check ---
    res = await get(port, '/api/spotify-import?url=invalid_playlist_url', token);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.code, 'spotify_error');
    assert.match(res.data.error, /Invalid Spotify playlist URL/);

    // --- Scenario 9: Non-legacy Spotify embed structure (entity.tracks.items, no entity.trackList) ---
    const modernPayload = {
      props: {
        pageProps: {
          state: {
            data: {
              entity: {
                name: 'Modern Ambient Waves',
                tracks: {
                  total: 2,
                  items: [
                    {
                      track: {
                        title: 'Solar Drift',
                        subtitle: 'Stellar Drone',
                        uri: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
                        duration_ms: 240000,
                        coverArt: { sources: [{ url: 'https://i.scdn.co/image/ambient1' }] }
                      }
                    },
                    {
                      track: {
                        name: 'Lunar Echoes',
                        artists: [{ name: 'Cosmic Path' }],
                        uri: 'spotify:track:11dFghVXANMlKmJXsNCbNl',
                        duration_ms: 195000,
                        coverArt: { sources: [{ url: 'https://i.scdn.co/image/ambient2' }] }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    };
    mockEmbedResponse = {
      status: 200,
      body: `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(modernPayload)}</script></head><body></body></html>`
    };
    res = await get(port, importUrl, token);
    assert.strictEqual(res.status, 200, 'Scenario 9 (modern embed with entity.tracks.items) should succeed');
    assert.strictEqual(res.data.name, 'Modern Ambient Waves');
    assert.strictEqual(res.data.tracks.length, 2);
    assert.strictEqual(res.data.tracks[0].title, 'Solar Drift');
    assert.strictEqual(res.data.tracks[0].artist, 'Stellar Drone');
    assert.strictEqual(res.data.tracks[0].duration, 240);
    assert.strictEqual(res.data.tracks[0].spotifyId, '4cOdK2wGLETKBW3PvgPWqT');
    assert.strictEqual(res.data.tracks[0].thumbnail, 'https://i.scdn.co/image/ambient1');
    assert.strictEqual(res.data.tracks[1].title, 'Lunar Echoes');
    assert.strictEqual(res.data.tracks[1].artist, 'Cosmic Path');
    assert.strictEqual(res.data.tracks[1].duration, 195);
    assert.strictEqual(res.data.tracks[1].spotifyId, '11dFghVXANMlKmJXsNCbNl');
    assert.strictEqual(res.data.tracks[1].thumbnail, 'https://i.scdn.co/image/ambient2');

  } finally {
    if (server) await server.stopServer();
    https.get = oldGet;
    if (oldDataDir === undefined) delete process.env.RASER_DATA_DIR;
    else process.env.RASER_DATA_DIR = oldDataDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
