import { gcm } from '@noble/ciphers/aes.js';

const rawKeys = new WeakMap<CryptoKey, Uint8Array>();

function asU8(input: BufferSource): Uint8Array {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function notSupported(): never {
  throw new DOMException('The operation is not supported.', 'NotSupportedError');
}

/** Minimal `SubtleCrypto` for AES-256-GCM on Hermes (no Node `node:crypto`). */
export function createNativeSubtleCrypto(): SubtleCrypto {
  const subtle: Pick<SubtleCrypto, 'importKey' | 'encrypt' | 'decrypt'> = {
    async importKey(format, keyData, algorithm, _extractable, keyUsages) {
      if (format !== 'raw') notSupported();
      if (typeof algorithm !== 'object' || algorithm === null || algorithm.name !== 'AES-GCM') {
        notSupported();
      }
      const raw = asU8(keyData as BufferSource);
      if (raw.byteLength !== 32) {
        throw new DOMException('Invalid key length', 'DataError');
      }
      const key = {
        algorithm: { name: 'AES-GCM', length: 256 },
        type: 'secret',
        extractable: false,
        usages: keyUsages,
      } as CryptoKey;
      rawKeys.set(key, new Uint8Array(raw));
      return key;
    },

    async encrypt(algorithm, key, data) {
      if (typeof algorithm !== 'object' || algorithm === null || algorithm.name !== 'AES-GCM') {
        notSupported();
      }
      const gcmParams = algorithm as AesGcmParams;
      const raw = rawKeys.get(key);
      if (!raw) throw new DOMException('Invalid key', 'InvalidAccessError');
      const iv = asU8(gcmParams.iv);
      const plain = asU8(data);
      return toArrayBuffer(gcm(raw, iv).encrypt(plain));
    },

    async decrypt(algorithm, key, data) {
      if (typeof algorithm !== 'object' || algorithm === null || algorithm.name !== 'AES-GCM') {
        notSupported();
      }
      const gcmParams = algorithm as AesGcmParams;
      const raw = rawKeys.get(key);
      if (!raw) throw new DOMException('Invalid key', 'InvalidAccessError');
      const iv = asU8(gcmParams.iv);
      const cipher = asU8(data);
      return toArrayBuffer(gcm(raw, iv).decrypt(cipher));
    },
  };

  return subtle as SubtleCrypto;
}
