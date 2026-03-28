import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/env.js', () => ({
  env: {
    CLIENT_BASE_URL: 'http://localhost:3001',
  },
}));

vi.mock('../config/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('qrcode', () => ({
  default: {
    toString: vi.fn(),
  },
}));

import { query as db } from '../config/db.js';
import QRCode from 'qrcode';
import { publicBookingRouter } from '../routes/public-booking.routes.js';

let server: http.Server;
let baseUrl = '';

type TestResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
};

async function request(path: string): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const req = http.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        text += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          text,
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

describe('public booking QR endpoint headers', () => {
  beforeAll(async () => {
    const app = express();
    app.use(helmet());
    app.use('/api/b', publicBookingRouter);

    server = app.listen(0);

    await new Promise<void>((resolve) => {
      server.on('listening', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets CORP to cross-origin so admin UI can render QR image', async () => {
    vi.mocked(db).mockResolvedValue({ rowCount: 1, rows: [{ id: 'link-1' }] } as never);
    vi.mocked(QRCode.toString).mockResolvedValue('<svg><rect /></svg>');

    const res = await request('/api/b/abc12345xyz_/qr');

    expect(res.status).toBe(200);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(String(res.headers['content-type'] || '')).toContain('image/svg+xml');
    expect(res.text).toContain('<svg>');
    expect(db).toHaveBeenCalledWith(
      'SELECT id FROM booking_links WHERE token = $1 AND is_active = TRUE',
      ['abc12345xyz_'],
    );
  });
});
