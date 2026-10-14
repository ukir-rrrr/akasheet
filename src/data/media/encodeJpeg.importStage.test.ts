/* eslint-disable import/first -- mocks before imports */
const mockKv = new Map<string, string>();

jest.mock('expo-sqlite/kv-store', () => ({
  Storage: {
    getItem: async (k: string) => mockKv.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      mockKv.set(k, v);
    },
    removeItem: async (k: string) => {
      mockKv.delete(k);
    },
    getAllKeys: async () => [...mockKv.keys()],
  },
}));

jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => {
    const b = new Uint8Array(n);
    b.fill(0xcd);
    return b;
  },
  digest: async (_alg: string, data: Uint8Array) =>
    new Uint8Array(
      (jest.requireActual('node:crypto') as typeof import('node:crypto'))
        .createHash('sha256')
        .update(data)
        .digest(),
    ),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
}));

const manipulateUris: string[] = [];

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: (uri: string) => {
      manipulateUris.push(uri);
      const ctx = {
        resize: () => ctx,
        renderAsync: async () => ({
          width: 64,
          height: 48,
          saveAsync: async () => ({
            uri: 'file:///encoded.jpg',
            width: 64,
            height: 48,
            base64: undefined,
          }),
        }),
      };
      return ctx;
    },
  },
  SaveFormat: { JPEG: 'jpeg' },
}));

import { encodeJpeg } from './encodeJpeg';
import { stageImportInMemory } from './importStage';
import { createMediaStore } from './store';
import { platformBackend } from './backend.web';

describe('encodeJpeg with import staging', () => {
  beforeEach(() => {
    manipulateUris.length = 0;
  });

  it('passes a data URI to ImageManipulator for akasheet-import staging URIs', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const staged = await stageImportInMemory(jpeg);
    await encodeJpeg(staged, 512, 0.85, true);
    expect(manipulateUris[0]).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('persistImportImage encodes staged bytes through the real web backend', async () => {
    const store = createMediaStore(platformBackend);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const media = await store.persistImportImage(jpeg, 'image/jpeg');
    expect(media.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manipulateUris.some((u) => u.startsWith('data:image/jpeg;base64,'))).toBe(true);
  });
});
