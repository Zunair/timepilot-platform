import { describe, expect, it } from 'vitest';

describe('project scripts', () => {
  it('defines the client dev script', async () => {
    const packageJson = await import('../package.json', {
      assert: { type: 'json' },
    });

    expect(packageJson.default.scripts['dev:client']).toBe('tsx watch src/client.ts');
  });

  it('keeps backend dev script configured', async () => {
    const packageJson = await import('../package.json', {
      assert: { type: 'json' },
    });

    expect(packageJson.default.scripts.dev).toBe('tsx watch src/server.ts');
  });

  it('defines the demo seed script', async () => {
    const packageJson = await import('../package.json', {
      assert: { type: 'json' },
    });

    expect(packageJson.default.scripts['seed:demo']).toBe('pwsh -NoProfile -File scripts/dev/seed-demo.ps1');
  });
});
