import worker from './pron.js';
import http from 'http';
import { Readable } from 'stream';

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Read body if present
    let body = null;
    if (req.method === 'POST') {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      body = Buffer.concat(buffers);
    }

    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: body
    });

    const response = await worker.fetch(request, {}, {});

    const responseHeaders = Object.fromEntries(response.headers.entries());
    res.writeHead(response.status, responseHeaders);

    const responseBody = await response.arrayBuffer();
    res.end(Buffer.from(responseBody));
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end(err.stack);
  }
}).listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
