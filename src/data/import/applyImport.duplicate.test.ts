import type { ImportPreview } from '@/import/types';
import { ValidationError } from '@/shared/errors';

import type { MediaStore } from '../media/store';
import type { CardRepo } from '../repos/cardRepo';
import type { FolderRepo } from '../repos/folderRepo';

import { applyImportPreview } from './applyImport';

describe('applyImportPreview duplicate race', () => {
  it('counts duplicate_import from create as skipped', async () => {
    const preview: ImportPreview = {
      source: 'import:csv',
      fileName: 'x.csv',
      folders: [],
      cards: [
        {
          externalId: 'row:1',
          title: null,
          folderPath: ['A'],
          imageBytes: new Uint8Array([1]),
          imageMime: 'image/jpeg',
          masks: [{ v: 1, shapes: [{ t: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.1 }] }],
        },
      ],
    };
    const result = await applyImportPreview(
      {
        folders: { ensurePath: async () => 'f1' } as unknown as FolderRepo,
        cards: {
          existingExternalIds: async () => new Set(),
          create: async () => {
            throw new ValidationError('duplicate_import');
          },
        } as unknown as CardRepo,
        store: {
          persistImportImage: async () => ({
            sha256: 'a'.repeat(64),
            path: 'media/aa/aaaa.jpg',
            thumbPath: 'thumbs/aa/aaaa.jpg',
            mime: 'image/jpeg',
            width: 10,
            height: 10,
            byteSize: 1,
            fresh: true,
          }),
          discardPersisted: async () => undefined,
        } as unknown as MediaStore,
      },
      preview,
    );
    expect(result.skippedDuplicate).toBe(1);
    expect(result.created).toBe(0);
  });
});
