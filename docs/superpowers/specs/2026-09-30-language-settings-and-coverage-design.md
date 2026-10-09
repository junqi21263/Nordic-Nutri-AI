# Language Settings and Coverage Design

## Goal

Finish the visible language gaps surfaced in the profile screen and replace the current language Bottom Sheet with the supplied Stitch language-and-display page. Support only the existing `zh-CN`, `zh-TW`, and `en` locales; keep the change local to the client and preserve current language persistence and runtime behavior.

## Findings

- The app already uses i18next and has parallel locale resources for all three supported languages.
- `LanguageSettings` currently renders a small Bottom Sheet in the profile screen. The supplied Stitch design is a dedicated page with a back/reset header, editorial introduction, one grouped set of four choices, a localization note, and a bottom “Save and apply” action.
- Both profile layouts render achievement titles returned by the API directly. The app already has a title-to-semantic-key map and localized titles for all known achievements, used by the achievements page and detail/unlock sheets.
- A read-only Han-character scan of i18n-enabled pages/components found other matches to be internal mappings, error/cancellation parsing, or data/category labels; the profile achievement preview is the clear user-visible gap in the supplied screenshots. Keep the scan focused on user-visible copy and report non-obvious leftovers rather than translating domain values or user content.

## Design

Add a dedicated `pages/language-settings/index` route and open it from the profile’s Language row. Follow the supplied Stitch structure and current Nordic design tokens: safe-area-aware custom header, back action, a reset-to-system icon, bilingual editorial introduction, a single rounded option card, a short localization note, and a bottom primary action with safe-area spacing. Replace the profile row’s generic dotted glyph with a matching Nordic-outline language/globe icon.

Language choices are a draft on this page. Choosing an option only changes the selected radio state; “Save and apply” persists the preference and immediately switches i18next, then returns to the profile. The reset icon selects “Follow system” as the draft. Back navigation discards an unapplied draft. Preserve the existing Android reminder refresh and authenticated push-schedule locale sync, running them only after applying a changed preference.

In both the standard and Android profile achievement previews, resolve known API achievement titles through the existing translation slug and `achievements.items.<slug>.title` resources. Retain the API title as a fallback for unknown future achievements. Do not change API/storage values or localize user-entered meal and profile content. Add the page’s interface copy to all three locale files with matching semantic keys.

## Alternatives

- Keep and restyle the Bottom Sheet: smallest change, but it does not match the supplied dedicated-page design.
- Use a dedicated page but apply each choice immediately: preserves the current interaction but loses the design’s explicit apply/cancel flow.
- Recommended: dedicated page with draft selection and explicit apply, as described above.

## Acceptance

1. The profile Language row has a clear language icon and opens the new page; back returns without applying an uncommitted choice.
2. All four choices render with a single selected state in `zh-CN`, `zh-TW`, and `en`; reset selects system; apply persists and changes visible UI immediately.
3. Applying a language retains existing reminder refresh and push-locale synchronization behavior; no API, database, or user-content changes are introduced.
4. Known achievement titles in both profile layouts follow the active locale; unknown titles still render safely.
5. Locale-key parity, focused component/profile tests, and the existing relevant i18n tests pass. Layout copy wraps without clipping at narrow mobile widths and respects the bottom safe area.
