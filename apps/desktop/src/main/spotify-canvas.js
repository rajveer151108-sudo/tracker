const CANVAS_ENDPOINT = "https://spclient.wg.spotify.com/canvaz-cache/v0/canvases";
const PATHFINDER_ENDPOINT = "https://api-partner.spotify.com/pathfinder/v2/query";
const CLIENT_TOKEN_ENDPOINT = "https://clienttoken.spotify.com/v1/clienttoken";
const WEB_PLAYER_CLIENT_ID = "d8a5ed958d274c2e8ee717e6a4b0971d";
const CANVAS_QUERY_HASH = "575138ab27cd5c1b3e54da54d0a7cc8d85485402de26340c2145f0f6bb5e7a9f";
const TRACK_URI_RE = /^spotify:track:[A-Za-z0-9]{22}$/;
const STREAM_HOST = "video-cf.spotifycdn.com";
const STREAM_PATH_RE = /^\/segments\/v1\/origins\/[a-f0-9]{32}\/sources\/[a-f0-9]{32}\/encodings\/[a-f0-9]{32}\/profiles\/(\d+)\/(?:inits\/webm|\d+\.webm)$/i;
let clientTokenCache = null;
const canvasDebug = (...args) => { if (process.env.AFTERGLOW_CANVAS_DEBUG) console.error("[canvas]", ...args); };

function validCanvasUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname === "canvaz.scdn.co" && /\.mp4$/i.test(parsed.pathname)
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}

function cacheFiles(root, depth = 0) {
  const fs = require("fs");
  if (!root || depth > 5) return [];
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((entry) => {
    const file = require("path").join(root, entry.name);
    if (entry.isDirectory()) return cacheFiles(file, depth + 1);
    return entry.isFile() && /\.(?:ldb|log)$/i.test(entry.name) ? [file] : [];
  });
}

function findCachedSpotifyCanvas(trackUri, roots) {
  if (!TRACK_URI_RE.test(String(trackUri || ""))) return "";
  const fs = require("fs");
  const encoded = Buffer.from(trackUri).toString("base64").replace(/=+$/, "");
  const marker = Buffer.from(`itemId=${encoded}`);
  const files = (Array.isArray(roots) ? roots : [roots]).flatMap((root) => cacheFiles(root)).flatMap((file) => {
    try {
      const stat = fs.statSync(file);
      return stat.size <= 32 * 1024 * 1024 ? [{ file, mtime: stat.mtimeMs }] : [];
    } catch {
      return [];
    }
  }).sort((a, b) => b.mtime - a.mtime).slice(0, 80);
  for (const entry of files) {
    let data;
    try { data = fs.readFileSync(entry.file); } catch { continue; }
    let offset = data.indexOf(marker);
    while (offset >= 0) {
      const nearby = data.subarray(offset, Math.min(data.length, offset + 900)).toString("latin1");
      const match = nearby.match(/https:\/\/canvaz\.scdn\.co\/[^\x00-\x20"'<>]+?\.mp4/i);
      const url = validCanvasUrl(match?.[0]);
      if (url) return url;
      offset = data.indexOf(marker, offset + marker.length);
    }
  }
  return "";
}

function browserCacheFiles(root) {
  const fs = require("fs");
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((entry) => {
    if (!entry.isFile() || entry.name === "index") return [];
    const file = require("path").join(root, entry.name);
    try {
      const stat = fs.statSync(file);
      return stat.size <= 10 * 1024 * 1024 ? [{ file, mtime: stat.mtimeMs }] : [];
    } catch {
      return [];
    }
  }).sort((a, b) => b.mtime - a.mtime).slice(0, 180);
}

function validStreamUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.hostname !== STREAM_HOST || !STREAM_PATH_RE.test(parsed.pathname)) return "";
    if (!parsed.searchParams.has("fauth") || !parsed.searchParams.has("token_ak") || !parsed.searchParams.has("token_cf")) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function streamDescriptor(url) {
  const parsed = new URL(url);
  const match = parsed.pathname.match(STREAM_PATH_RE);
  if (!match) return null;
  const prefix = parsed.pathname.replace(/\/profiles\/\d+\/.*$/, "");
  return {
    prefix,
    profile: Number(match[1]),
    query: parsed.search,
    key: prefix,
  };
}

function findCachedSpotifyStream(trackUri, root) {
  if (!TRACK_URI_RE.test(String(trackUri || ""))) return null;
  const fs = require("fs");
  const trackId = Buffer.from(trackUri.slice("spotify:track:".length));
  const files = browserCacheFiles(root);
  let trackTime = 0;
  const streams = [];
  for (const entry of files) {
    let data;
    try { data = fs.readFileSync(entry.file); } catch { continue; }
    if (data.indexOf(trackId) >= 0) trackTime = Math.max(trackTime, entry.mtime);
    const text = data.toString("latin1");
    const matches = text.match(/https:\/\/video-cf\.spotifycdn\.com\/[\x21-\x7e]+/g) || [];
    for (const candidate of matches) {
      const safe = validStreamUrl(candidate);
      const descriptor = safe && streamDescriptor(safe);
      if (descriptor) streams.push({ ...descriptor, mtime: entry.mtime });
    }
  }
  if (!trackTime || !streams.length) return null;
  const near = streams.filter((entry) => Math.abs(entry.mtime - trackTime) <= 45_000);
  if (!near.length) return null;
  near.sort((a, b) => {
    const delta = Math.abs(a.mtime - trackTime) - Math.abs(b.mtime - trackTime);
    if (delta) return delta;
    const preference = (value) => value === 2 ? 0 : value === 1 ? 1 : 2;
    return preference(a.profile) - preference(b.profile);
  });
  const nearestKey = near[0].key;
  const sameStream = near.filter((entry) => entry.key === nearestKey);
  const preferred = sameStream.find((entry) => entry.profile === 2)
    || sameStream.find((entry) => entry.profile === 1)
    || sameStream[0];
  return preferred ? { prefix: preferred.prefix, profile: preferred.profile, query: preferred.query } : null;
}

async function fetchWebmPart(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  canvasDebug("stream part", new URL(url).pathname.split("/").slice(-2).join("/"), response.status);
  if (!response.ok) return null;
  const type = String(response.headers?.get?.("content-type") || "").toLowerCase();
  if (type && !type.includes("video/webm") && !type.includes("application/octet-stream")) return null;
  return Buffer.from(await response.arrayBuffer());
}

async function materializeSpotifyStreamCanvas(trackUri, browserRoot, outputRoot, fetchImpl = fetch) {
  if (!TRACK_URI_RE.test(String(trackUri || ""))) return "";
  const fs = require("fs");
  const path = require("path");
  const { pathToFileURL } = require("url");
  const trackId = trackUri.slice("spotify:track:".length);
  const output = path.join(outputRoot, `${trackId}.webm`);
  try {
    if (fs.statSync(output).size > 4096) return pathToFileURL(output).href;
  } catch {}
  const stream = findCachedSpotifyStream(trackUri, browserRoot);
  if (!stream) {
    canvasDebug("no matching stream cache entry", trackId);
    return "";
  }
  const base = `https://${STREAM_HOST}${stream.prefix}/profiles/${stream.profile}`;
  const initUrl = validStreamUrl(`${base}/inits/webm${stream.query}`);
  if (!initUrl) {
    canvasDebug("invalid init URL", trackId);
    return "";
  }
  const parts = [];
  try {
    const init = await fetchWebmPart(initUrl, fetchImpl);
    if (!init) return "";
    parts.push(init);
    for (let second = 0; second <= 60; second += 4) {
      const segmentUrl = validStreamUrl(`${base}/${second}.webm${stream.query}`);
      if (!segmentUrl) return "";
      const segment = await fetchWebmPart(segmentUrl, fetchImpl);
      if (!segment) break;
      parts.push(segment);
    }
    if (parts.length < 2) return "";
    fs.mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
    const temporary = `${output}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, Buffer.concat(parts), { mode: 0o600 });
    fs.renameSync(temporary, output);
    return pathToFileURL(output).href;
  } catch (error) {
    canvasDebug("stream assembly failed", error?.message || error);
    return "";
  }
}

function encodeVarint(value) {
  const bytes = [];
  let current = Number(value) >>> 0;
  while (current > 127) {
    bytes.push((current & 0x7f) | 0x80);
    current >>>= 7;
  }
  bytes.push(current);
  return Buffer.from(bytes);
}

function encodeCanvasRequest(trackUri) {
  if (!TRACK_URI_RE.test(String(trackUri || ""))) throw new Error("Invalid Spotify track URI");
  const uri = Buffer.from(trackUri, "utf8");
  const track = Buffer.concat([Buffer.from([0x0a]), encodeVarint(uri.length), uri]);
  return Buffer.concat([Buffer.from([0x0a]), encodeVarint(track.length), track]);
}

function readVarint(buffer, offset) {
  let value = 0;
  let shift = 0;
  let cursor = offset;
  while (cursor < buffer.length && shift <= 28) {
    const byte = buffer[cursor++];
    value |= (byte & 0x7f) << shift;
    if (!(byte & 0x80)) return { value: value >>> 0, offset: cursor };
    shift += 7;
  }
  throw new Error("Invalid protobuf varint");
}

function readFields(buffer) {
  const fields = [];
  let offset = 0;
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    offset = tag.offset;
    const field = tag.value >>> 3;
    const wire = tag.value & 7;
    if (wire === 0) {
      const value = readVarint(buffer, offset);
      offset = value.offset;
      fields.push({ field, wire, value: value.value });
    } else if (wire === 1) {
      if (offset + 8 > buffer.length) throw new Error("Truncated protobuf field");
      fields.push({ field, wire, value: buffer.subarray(offset, offset + 8) });
      offset += 8;
    } else if (wire === 2) {
      const length = readVarint(buffer, offset);
      offset = length.offset;
      const end = offset + length.value;
      if (end > buffer.length) throw new Error("Truncated protobuf field");
      fields.push({ field, wire, value: buffer.subarray(offset, end) });
      offset = end;
    } else if (wire === 5) {
      if (offset + 4 > buffer.length) throw new Error("Truncated protobuf field");
      fields.push({ field, wire, value: buffer.subarray(offset, offset + 4) });
      offset += 4;
    } else {
      throw new Error("Unsupported protobuf wire type");
    }
  }
  return fields;
}

function decodeCanvasResponse(value, trackUri) {
  const response = Buffer.from(value);
  for (const entry of readFields(response).filter((item) => item.field === 1 && item.wire === 2)) {
    const fields = readFields(entry.value);
    const uri = fields.find((item) => item.field === 5 && item.wire === 2)?.value.toString("utf8");
    const canvasUrl = fields.find((item) => item.field === 2 && item.wire === 2)?.value.toString("utf8");
    if (uri !== trackUri || !canvasUrl) continue;
    try {
      const parsed = new URL(canvasUrl);
      if (parsed.protocol === "https:" && parsed.hostname === "canvaz.scdn.co" && /\.mp4$/i.test(parsed.pathname)) {
        return parsed.href;
      }
    } catch {}
  }
  return "";
}

async function getClientToken(fetchImpl) {
  if (clientTokenCache && Date.now() < clientTokenCache.expiresAt) return clientTokenCache.token;
  const response = await fetchImpl(CLIENT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_data: {
        client_version: "1.2.42.432.g3121",
        client_id: WEB_PLAYER_CLIENT_ID,
        js_sdk_data: {
          device_brand: "Apple",
          device_model: "MacBookPro",
          os: "Mac OS",
          os_version: "10.15.7",
          device_id: require("crypto").randomBytes(16).toString("hex"),
          device_type: "computer",
        },
      },
    }),
    signal: AbortSignal.timeout(6500),
  });
  if (!response.ok) throw new Error(`Canvas client token HTTP ${response.status}`);
  const data = await response.json();
  const token = data?.granted_token?.token;
  if (!token) throw new Error("Canvas client token was missing");
  clientTokenCache = {
    token,
    expiresAt: Date.now() + Math.max(60, Number(data.granted_token.expires_after_seconds || 3600) - 60) * 1000,
  };
  return token;
}

async function fetchPathfinderCanvas(trackUri, accessToken, fetchImpl) {
  const clientToken = await getClientToken(fetchImpl);
  const response = await fetchImpl(PATHFINDER_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "client-token": clientToken,
    },
    body: JSON.stringify({
      operationName: "canvas",
      variables: { trackUri },
      extensions: { persistedQuery: { version: 1, sha256Hash: CANVAS_QUERY_HASH } },
    }),
    signal: AbortSignal.timeout(6500),
  });
  if (!response.ok) return { ok: false, status: response.status, error: `Canvas HTTP ${response.status}` };
  const data = await response.json().catch(() => null);
  const url = validCanvasUrl(data?.data?.trackUnion?.canvas?.url);
  return url ? { ok: true, url } : { ok: false, status: 404, error: "This track has no Canvas" };
}

async function fetchSpotifyCanvas(trackUri, accessToken, fetchImpl = fetch) {
  if (!TRACK_URI_RE.test(String(trackUri || ""))) return { ok: false, error: "Invalid Spotify track URI" };
  if (!accessToken) return { ok: false, error: "Spotify is not connected" };
  try {
    const pathfinder = await fetchPathfinderCanvas(trackUri, accessToken, fetchImpl);
    if (pathfinder.ok || pathfinder.status === 404) return pathfinder;
    const response = await fetchImpl(CANVAS_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/protobuf",
        "Content-Type": "application/protobuf",
        "Accept-Language": "en",
        "User-Agent": "Spotify/9.0.34.593 iOS/18.4 (iPhone15,3)",
        Authorization: `Bearer ${accessToken}`,
      },
      body: encodeCanvasRequest(trackUri),
      signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) return { ok: false, status: response.status, error: `Canvas HTTP ${response.status}` };
    const url = decodeCanvasResponse(await response.arrayBuffer(), trackUri);
    return url ? { ok: true, url } : { ok: false, status: 404, error: "This track has no Canvas" };
  } catch (error) {
    return { ok: false, status: 0, error: String(error?.message || error) };
  }
}

module.exports = {
  encodeCanvasRequest,
  decodeCanvasResponse,
  findCachedSpotifyCanvas,
  findCachedSpotifyStream,
  materializeSpotifyStreamCanvas,
  fetchSpotifyCanvas,
};
