import type { Clock } from './clock';

export type RandomBytes = (n: number) => Uint8Array;

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** RFC 9562 UUIDv7: 48-bit unix ms timestamp, version 7, variant 10, random tail. */
export function createIdGenerator(clock: Clock, randomBytes: RandomBytes): () => string {
  return () => {
    const ms = clock.now();
    const b = randomBytes(16);
    b[0] = Math.floor(ms / 2 ** 40) & 0xff;
    b[1] = Math.floor(ms / 2 ** 32) & 0xff;
    b[2] = (ms >>> 24) & 0xff;
    b[3] = (ms >>> 16) & 0xff;
    b[4] = (ms >>> 8) & 0xff;
    b[5] = ms & 0xff;
    b[6] = 0x70 | (b[6] & 0x0f);
    b[8] = 0x80 | (b[8] & 0x3f);
    const h = Array.from(b, (x) => HEX[x]).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
}
