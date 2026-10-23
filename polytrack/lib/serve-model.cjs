const { createReadStream } = require("node:fs");
const { extname } = require("node:path");

module.exports = function serveModel(request, response, filePath, stat, headers = {}) {
  if (extname(filePath).toLowerCase() !== ".glb") return false;
  const baseHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => !["content-length", "content-range", "content-type"].includes(name.toLowerCase())));
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match && (match[1] || match[2])) {
      if (!match[1]) start = Math.max(0, stat.size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
    }
    if (!match || (!match[1] && !match[2]) || start > end || start >= stat.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      response.writeHead(416, { ...baseHeaders, "Content-Range": `bytes */${stat.size}`, "Content-Length": 0 });
      response.end();
      return true;
    }
    status = 206;
  }
  response.writeHead(status, {
    ...baseHeaders,
    "Content-Type": "model/gltf-binary",
    "Accept-Ranges": "bytes",
    "Content-Length": end - start + 1,
    ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${stat.size}` } : {}),
  });
  if (request.method === "HEAD") response.end();
  else {
    const stream = createReadStream(filePath, { start, end });
    stream.on("error", () => response.destroy());
    response.on("close", () => stream.destroy());
    stream.pipe(response);
  }
  return true;
};
