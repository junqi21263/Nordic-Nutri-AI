# Recommend Friends Poster

Date: 2026-08-04

## Goal

Let users invite friends from **我的** with a static Nordic Nutri poster: share via WeChat or save to the album.

## Scope

- Profile list entry **推荐好友** above **退出登录**
- Page shows the provided poster as-is (no live mini-program QR generation)
- Bottom actions: **微信** → native `showShareImageMenu` (friends / Moments); **保存** → photo album
- Poster served from CloudBase brand CDN to keep the main package small

## Out of scope

- Dynamic personal QR / wxacode
- Custom in-app Moments UI beyond the WeChat native share-image menu

## UX

1. Tap 推荐好友 → poster preview page with back
2. 微信 → download CDN poster to temp file → `Taro.showShareImageMenu`
3. 保存 → authorize `writePhotosAlbum` if needed → `Taro.saveImageToPhotosAlbum`
