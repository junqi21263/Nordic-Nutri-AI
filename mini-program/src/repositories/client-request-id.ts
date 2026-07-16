export function createClientRequestIds(createId: () => string) {
  const ids = new Map<string, string>();

  return {
    forDraft(draftId: string) {
      const existing = ids.get(draftId);
      if (existing) return existing;
      const id = createId();
      ids.set(draftId, id);
      return id;
    },
    complete(draftId: string) {
      ids.delete(draftId);
    },
  };
}
