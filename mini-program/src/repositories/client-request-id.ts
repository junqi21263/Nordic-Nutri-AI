export function createClientRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Number.parseInt(hex(), 16);
    return token === "x" ? value.toString(16) : ((value & 0x3) | 0x8).toString(16);
  });
}

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
