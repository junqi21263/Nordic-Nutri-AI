#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

read_status_value() {
  local key="$1"
  printf '%s\n' "$status_env" | awk -v key="$key" '
    index($0, key "=") == 1 {
      sub(/^[^=]*=/, "")
      gsub(/^"|"$/, "")
      print
      exit
    }
  '
}

status_env="$(pnpm exec supabase status -o env 2>/dev/null)"
api_url="$(read_status_value API_URL)"
publishable_key="$(read_status_value PUBLISHABLE_KEY)"

if [[ -z "$api_url" || -z "$publishable_key" ]]; then
  echo "Local Supabase API is unavailable. Run pnpm exec supabase start first." >&2
  exit 1
fi

invoke_wechat_login() {
  local code="$1"
  curl -sS -w $'\n%{http_code}' "$api_url/functions/v1/wechat-login" \
    -X POST -H "apikey: $publishable_key" -H 'content-type: application/json' \
    --data "$(jq -nc --arg code "$code" '{code: $code}')"
}

assert_status() {
  local response="$1"
  local expected="$2"
  local label="${3:-request}"
  local actual="${response##*$'\n'}"
  if [[ "$actual" != "$expected" ]]; then
    echo "$label: expected HTTP $expected, got $actual" >&2
    exit 1
  fi
}

response_body() {
  printf '%s' "${1%$'\n'*}"
}

exchange_token_hash() {
  local token_hash="$1"
  curl -sS -w $'\n%{http_code}' "$api_url/auth/v1/verify" \
    -X POST -H "apikey: $publishable_key" -H 'content-type: application/json' \
    --data "$(jq -nc --arg token_hash "$token_hash" '{token_hash: $token_hash, type: "email"}')"
}

login_response="$(invoke_wechat_login 'phase25-mock-code-user-a-0001')"
assert_status "$login_response" 200 'first mock login'
login_body="$(response_body "$login_response")"
jq -e '.success == true and .data.type == "email" and (.data.tokenHash | type == "string")' >/dev/null <<<"$login_body"
token_hash_a="$(jq -er '.data.tokenHash' <<<"$login_body")"

session_response_a="$(exchange_token_hash "$token_hash_a")"
assert_status "$session_response_a" 200 'first token exchange'
session_a="$(response_body "$session_response_a")"
jq -e '.access_token and .refresh_token and .expires_at and .user.id' >/dev/null <<<"$session_a"
access_token_a="$(jq -er '.access_token' <<<"$session_a")"
refresh_token_a="$(jq -er '.refresh_token' <<<"$session_a")"
user_a="$(jq -er '.user.id' <<<"$session_a")"

used_token_response="$(exchange_token_hash "$token_hash_a")"
used_token_status="${used_token_response##*$'\n'}"
[[ "$used_token_status" =~ ^(400|401|403|422)$ ]]

invalid_token_response="$(exchange_token_hash 'not-a-valid-token-hash')"
invalid_token_status="${invalid_token_response##*$'\n'}"
[[ "$invalid_token_status" =~ ^(400|401|403|422)$ ]]

replayed_code_response="$(invoke_wechat_login 'phase25-mock-code-user-a-0001')"
assert_status "$replayed_code_response" 409 'replayed code'

auth_user_response="$(curl -sS --fail-with-body "$api_url/auth/v1/user" -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a")"
jq -e --arg user_id "$user_a" '.id == $user_id' >/dev/null <<<"$auth_user_response"

own_profile="$(curl -sS --fail-with-body "$api_url/rest/v1/profiles?select=id" -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a")"
jq -e --arg user_id "$user_a" 'length == 1 and .[0].id == $user_id' >/dev/null <<<"$own_profile"

active_meals_before="$(curl -sS --fail-with-body "$api_url/rest/v1/active_meal_records?select=id" -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a")"
jq -e 'length == 0' >/dev/null <<<"$active_meals_before"

identity_access_status="$(curl -sS -o /dev/null -w '%{http_code}' "$api_url/rest/v1/wechat_identities?select=user_id" -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a")"
[[ "$identity_access_status" =~ ^(401|403)$ ]]

repeat_identity_response="$(invoke_wechat_login 'phase25-mock-code-user-a-0002')"
assert_status "$repeat_identity_response" 200 'same identity with new code'
repeat_token_hash="$(jq -er '.data.tokenHash' <<<"$(response_body "$repeat_identity_response")")"
repeat_session_response="$(exchange_token_hash "$repeat_token_hash")"
assert_status "$repeat_session_response" 200 'same identity token exchange'
jq -e --arg user_id "$user_a" '.user.id == $user_id' >/dev/null <<<"$(response_body "$repeat_session_response")"

login_response_b="$(invoke_wechat_login 'phase25-mock-code-user-b-0001')"
assert_status "$login_response_b" 200 'second identity login'
token_hash_b="$(jq -er '.data.tokenHash' <<<"$(response_body "$login_response_b")")"
session_response_b="$(exchange_token_hash "$token_hash_b")"
assert_status "$session_response_b" 200 'second identity token exchange'
session_b="$(response_body "$session_response_b")"
access_token_b="$(jq -er '.access_token' <<<"$session_b")"
user_b="$(jq -er '.user.id' <<<"$session_b")"
[[ "$user_a" != "$user_b" ]]

foreign_profile="$(curl -sS --fail-with-body "$api_url/rest/v1/profiles?id=eq.$user_b&select=id" -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a")"
jq -e 'length == 0' >/dev/null <<<"$foreign_profile"

foreign_asset_path="$user_b/phase25-foreign-asset.jpg"
foreign_asset_payload="$(jq -nc --arg user_id "$user_b" --arg object_path "$foreign_asset_path" '{user_id: $user_id, bucket_id: "food-images", object_path: $object_path, content_type: "image/jpeg", byte_size: 100, sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", status: "uploaded"}')"
curl -sS --fail-with-body "$api_url/rest/v1/uploaded_assets" -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_b" -H 'content-type: application/json' --data "$foreign_asset_payload" >/dev/null

foreign_asset_request_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
foreign_asset_meal_payload="$(jq -nc --arg request_id "$foreign_asset_request_id" --arg image_path "$foreign_asset_path" '{clientRequestId: $request_id, name: "Foreign asset attempt", mealType: "lunch", imagePath: $image_path, items: [{name: "Rejected asset meal", confirmedQuantityG: 100, caloriesPer100g: 120, proteinGPer100g: 24, carbsGPer100g: 0, fatGPer100g: 2}]}')"
foreign_asset_status="$(curl -sS -o /dev/null -w '%{http_code}' "$api_url/functions/v1/save-meal" -X POST -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a" -H 'content-type: application/json' --data "$foreign_asset_meal_payload")"
[[ "$foreign_asset_status" == "403" ]]
foreign_asset_rollback="$(curl -sS --fail-with-body "$api_url/rest/v1/meal_records?client_request_id=eq.$foreign_asset_request_id&select=id" -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a")"
jq -e 'length == 0' >/dev/null <<<"$foreign_asset_rollback"

request_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
save_meal_payload="$(jq -nc --arg request_id "$request_id" '{clientRequestId: $request_id, name: "Phase 2.5 authenticated meal", mealType: "lunch", recordedAt: "2026-07-16T12:00:00Z", items: [{name: "Phase 2.5 chicken", confirmedQuantityG: 100, caloriesPer100g: 120, proteinGPer100g: 24, carbsGPer100g: 0, fatGPer100g: 2}]}')"
save_meal_response="$(curl -sS -w $'\n%{http_code}' "$api_url/functions/v1/save-meal" -X POST -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a" -H 'content-type: application/json' --data "$save_meal_payload")"
assert_status "$save_meal_response" 200 'first authenticated save-meal'
save_meal_body="$(response_body "$save_meal_response")"
jq -e '.success == true and .data.meal.name == "Phase 2.5 authenticated meal" and (.data.items | length) == 1 and .data.meal.calories_kcal == 120' >/dev/null <<<"$save_meal_body"
meal_id="$(jq -er '.data.meal.id' <<<"$save_meal_body")"

idempotent_response="$(curl -sS -w $'\n%{http_code}' "$api_url/functions/v1/save-meal" -X POST -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a" -H 'content-type: application/json' --data "$save_meal_payload")"
assert_status "$idempotent_response" 200 'idempotent save-meal'
jq -e --arg meal_id "$meal_id" '.data.meal.id == $meal_id and (.data.items | length) == 1' >/dev/null <<<"$(response_body "$idempotent_response")"

invalid_item_request_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
invalid_item_payload="$(jq -nc --arg request_id "$invalid_item_request_id" '{clientRequestId: $request_id, name: "Invalid item rollback", mealType: "dinner", items: [{name: "Missing quantity", caloriesPer100g: 120, proteinGPer100g: 24, carbsGPer100g: 0, fatGPer100g: 2}]}')"
invalid_item_status="$(curl -sS -o /dev/null -w '%{http_code}' "$api_url/functions/v1/save-meal" -X POST -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a" -H 'content-type: application/json' --data "$invalid_item_payload")"
[[ "$invalid_item_status" == "500" ]]
invalid_item_rollback="$(curl -sS --fail-with-body "$api_url/rest/v1/meal_records?client_request_id=eq.$invalid_item_request_id&select=id" -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a")"
jq -e 'length == 0' >/dev/null <<<"$invalid_item_rollback"

foreign_meal="$(curl -sS --fail-with-body "$api_url/rest/v1/active_meal_records?id=eq.$meal_id&select=id" -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_b")"
jq -e 'length == 0' >/dev/null <<<"$foreign_meal"

unauthorized_save_status="$(curl -sS -o /dev/null -w '%{http_code}' "$api_url/functions/v1/save-meal" -X POST -H "apikey: $publishable_key" -H 'content-type: application/json' --data "$save_meal_payload")"
[[ "$unauthorized_save_status" == "401" ]]

curl -sS --fail-with-body -X PATCH "$api_url/rest/v1/meal_records?id=eq.$meal_id" -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a" -H 'content-type: application/json' --data '{"deleted_at":"2026-07-16T13:00:00Z"}' >/dev/null
archived_meal="$(curl -sS --fail-with-body "$api_url/rest/v1/active_meal_records?id=eq.$meal_id&select=id" -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a")"
jq -e 'length == 0' >/dev/null <<<"$archived_meal"
curl -sS --fail-with-body -X PATCH "$api_url/rest/v1/meal_records?id=eq.$meal_id" -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a" -H 'content-type: application/json' --data '{"deleted_at":null}' >/dev/null
restored_meal="$(curl -sS --fail-with-body "$api_url/rest/v1/active_meal_records?id=eq.$meal_id&select=id" -H "apikey: $publishable_key" -H "authorization: Bearer $access_token_a")"
jq -e --arg meal_id "$meal_id" 'length == 1 and .[0].id == $meal_id' >/dev/null <<<"$restored_meal"

refresh_response="$(curl -sS -w $'\n%{http_code}' "$api_url/auth/v1/token?grant_type=refresh_token" -X POST -H "apikey: $publishable_key" -H 'content-type: application/json' --data "$(jq -nc --arg refresh_token "$refresh_token_a" '{refresh_token: $refresh_token}')")"
assert_status "$refresh_response" 200 'session refresh'
refreshed_session="$(response_body "$refresh_response")"
jq -e '.access_token and .refresh_token and .expires_at and .user.id' >/dev/null <<<"$refreshed_session"

invalid_refresh_status="$(curl -sS -o /dev/null -w '%{http_code}' "$api_url/auth/v1/token?grant_type=refresh_token" -X POST -H "apikey: $publishable_key" -H 'content-type: application/json' --data '{"refresh_token":"invalid-refresh-token"}')"
[[ "$invalid_refresh_status" =~ ^(400|401)$ ]]

echo "Mock WeChat login, OTP exchange, session refresh, real-JWT RLS, and save-meal E2E checks passed."
