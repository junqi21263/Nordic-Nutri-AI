import { describe, expect, it } from "vitest";
import { createPendingReminderStorage } from "./pending-reminder";

describe("pending reminder storage", () => {
  it("round-trips once and consumes the pending meal type", () => {
    let value: unknown = null;
    const storage = createPendingReminderStorage({ read: () => value, write: (_, next) => { value = next; }, remove: () => { value = null; } });
    storage.save("lunch");
    expect(storage.consume()).toMatchObject({ mealType: "lunch" });
    expect(storage.consume()).toBeNull();
  });
});
