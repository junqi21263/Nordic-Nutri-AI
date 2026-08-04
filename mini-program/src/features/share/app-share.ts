/**
 * Use a public HTTPS image for WeChat share previews.
 * Do not bundle share-card into the mini program package (keeps main package under 1.5MB).
 */
export const APP_SHARE_TITLE = "让每一餐都有价值";
export const APP_SHARE_PATH = "/pages/welcome/index";
export const APP_SHARE_IMAGE =
  "https://lewis-healthy-d4glgqqzv73a5bc10-1420560890.tcloudbaseapp.com/brand/share-card.jpg";

export function buildAppShareMessage(path = APP_SHARE_PATH) {
  return {
    title: APP_SHARE_TITLE,
    path,
    imageUrl: APP_SHARE_IMAGE,
  };
}

export function buildAppTimelineShare() {
  return {
    title: APP_SHARE_TITLE,
    imageUrl: APP_SHARE_IMAGE,
  };
}
