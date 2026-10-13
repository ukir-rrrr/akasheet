export const keys = {
  folders: ['folders'] as const,
  folder: (id: string) => ['folder', id] as const,
  cards: (folderId: string) => ['cards', folderId] as const,
  card: (id: string) => ['card', id] as const,
  media: (rel: string) => ['media', rel] as const,
  nextDue: (folderId: string | null) => ['nextDue', folderId ?? 'all'] as const,
  preview: (cardId: string, answered: number) => ['preview', cardId, answered] as const,
};
