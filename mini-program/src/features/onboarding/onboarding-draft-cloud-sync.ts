import { saveProductOnboardingDraft } from "../../api/product-data-api";
import type { OnboardingDraft } from "./domain";

let timer: ReturnType<typeof setTimeout> | null = null;
let pendingDraft: OnboardingDraft | null = null;

export function queueOnboardingDraftSync(draft: OnboardingDraft) {
  pendingDraft = { ...draft, foodAvoidances: [...draft.foodAvoidances] };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const next = pendingDraft;
    pendingDraft = null;
    if (next) void saveProductOnboardingDraft(next).catch(() => undefined);
  }, 500);
}

export function clearQueuedOnboardingDraftSync() {
  if (timer) clearTimeout(timer);
  timer = null;
  pendingDraft = null;
}
