/**
 * Minimal client placeholder server for local development.
 *
 * This keeps the configured CLIENT_BASE_URL reachable during Phase 1
 * until the full React booking interface is implemented.
 */

import http from 'node:http';
import { env } from './config/env.js';

const clientPort = Number(new URL(env.CLIENT_BASE_URL).port || 3001);

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TimePilot Client Placeholder</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f3efe7;
        --panel: #fffaf2;
        --text: #1f2937;
        --muted: #5b6472;
        --accent: #0f766e;
        --border: #d6d3d1;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: Georgia, 'Times New Roman', serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 28%),
          linear-gradient(135deg, #f8f5ef, var(--bg));
        display: grid;
        place-items: center;
        padding: 24px;
      }

      main {
        max-width: 760px;
        width: 100%;
        background: rgba(255, 250, 242, 0.92);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 32px;
        box-shadow: 0 20px 60px rgba(31, 41, 55, 0.12);
      }

      h1 {
        margin: 0 0 12px;
        font-size: clamp(2rem, 4vw, 3.5rem);
        line-height: 1.05;
      }

      p {
        margin: 0 0 16px;
        font-size: 1.05rem;
        line-height: 1.6;
        color: var(--muted);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        margin-top: 24px;
      }

      .card {
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 18px;
        background: var(--panel);
      }

      .label {
        display: inline-block;
        margin-bottom: 10px;
        font-size: 0.75rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
      }

      code {
        font-family: Consolas, 'Courier New', monospace;
        font-size: 0.95rem;
      }
    </style>
  </head>
  <body>
    <main>
      <span class="label">Phase 1 Client Scaffold</span>
      <h1>TimePilot client endpoint is live.</h1>
      <p>
        This placeholder confirms that the configured client URL is reachable on port 3001.
        The full booking interface has not been implemented yet.
      </p>
      <div class="grid">
        <section class="card">
          <span class="label">Backend API</span>
          <p><code>${env.API_BASE_URL}/health</code></p>
        </section>
        <section class="card">
          <span class="label">Client URL</span>
          <p><code>${env.CLIENT_BASE_URL}</code></p>
        </section>
        <section class="card">
          <span class="label">Next Work</span>
          <p>Calendar UI, time-slot selection, booking summary, and client form.</p>
        </section>
      </div>
    </main>
  </body>
</html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(clientPort, () => {
  console.log(`TimePilot client placeholder started on ${env.CLIENT_BASE_URL}`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
