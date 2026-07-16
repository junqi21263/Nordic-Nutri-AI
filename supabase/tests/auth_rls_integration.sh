#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

postgres_url="postgresql://postgres@127.0.0.1:54322/postgres"
password='AuthTest-2026!'
run_id="$(date +%s)-$RANDOM"
email_a="auth-a-${run_id}@example.test"
email_b="auth-b-${run_id}@example.test"
user_a=""
user_b=""

cleanup() {
  if [[ -n "$user_a" || -n "$user_b" ]]; then
    PGPASSWORD=postgres psql "$postgres_url" -v ON_ERROR_STOP=1 \
      -c "delete from auth.users where id in (nullif('$user_a', '')::uuid, nullif('$user_b', '')::uuid);" \
      >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

assert_uuid() {
  local value="$1"
  [[ "$value" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]
}

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
anon_key="$(read_status_value ANON_KEY)"

if [[ -z "$api_url" || -z "$anon_key" ]]; then
  echo "Local Supabase API is unavailable. Run pnpm exec supabase start first." >&2
  exit 1
fi

auth_signup() {
  local email="$1"
  curl -sS --fail-with-body "$api_url/auth/v1/signup" \
    -H "apikey: $anon_key" \
    -H 'content-type: application/json' \
    --data "$(jq -nc --arg email "$email" --arg password "$password" '{email: $email, password: $password}')"
}

auth_password_login() {
  local email="$1"
  curl -sS --fail-with-body "$api_url/auth/v1/token?grant_type=password" \
    -H "apikey: $anon_key" \
    -H 'content-type: application/json' \
    --data "$(jq -nc --arg email "$email" --arg password "$password" '{email: $email, password: $password}')"
}

signup_a="$(auth_signup "$email_a")"
signup_b="$(auth_signup "$email_b")"
user_a="$(jq -er '.user.id' <<<"$signup_a")"
user_b="$(jq -er '.user.id' <<<"$signup_b")"
assert_uuid "$user_a"
assert_uuid "$user_b"

login_a="$(auth_password_login "$email_a")"
access_token_a="$(jq -er '.access_token' <<<"$login_a")"
refresh_token_a="$(jq -er '.refresh_token' <<<"$login_a")"
login_b="$(auth_password_login "$email_b")"
access_token_b="$(jq -er '.access_token' <<<"$login_b")"

refreshed_a="$(curl -sS --fail-with-body "$api_url/auth/v1/token?grant_type=refresh_token" \
  -H "apikey: $anon_key" \
  -H 'content-type: application/json' \
  --data "$(jq -nc --arg refresh_token "$refresh_token_a" '{refresh_token: $refresh_token}')")"
jq -e '.access_token and .refresh_token' >/dev/null <<<"$refreshed_a"

insert_owned_records() {
  local user_id="$1"
  assert_uuid "$user_id"
  PGPASSWORD=postgres psql "$postgres_url" -v ON_ERROR_STOP=1 -c "
    with goal as (
      insert into public.user_goals (user_id, goal_type)
      values ('$user_id'::uuid, 'maintain')
      returning id
    ), body as (
      insert into public.body_profiles (user_id, age, sex, height_cm, weight_kg)
      values ('$user_id'::uuid, 30, 'undisclosed', 170, 65)
      returning id
    ), plan as (
      insert into public.nutrition_plans (
        user_id, goal_id, body_profile_id, daily_calories_kcal, protein_g, carbs_g, fat_g
      )
      select '$user_id'::uuid, goal.id, body.id, 2200, 140, 260, 65 from goal cross join body
      returning id
    )
    insert into public.meal_records (user_id, plan_id, name, calories_kcal, protein_g, carbs_g, fat_g)
    select '$user_id'::uuid, plan.id, 'Auth integration test meal', 500, 35, 55, 15 from plan;
  " >/dev/null
}

insert_owned_records "$user_a"
insert_owned_records "$user_b"

assert_count() {
  local table_name="$1"
  local expected="$2"
  local user_id="$3"
  local filter="user_id=eq.$user_id"
  if [[ "$table_name" == "profiles" ]]; then filter="id=eq.$user_id"; fi

  local response
  response="$(curl -sS --fail-with-body "$api_url/rest/v1/$table_name?select=id&$filter" \
    -H "apikey: $anon_key" \
    -H "authorization: Bearer $access_token_a")"
  local actual
  actual="$(jq -er 'length' <<<"$response")"
  if [[ "$actual" != "$expected" ]]; then
    echo "RLS assertion failed for $table_name: expected $expected rows, got $actual" >&2
    exit 1
  fi
}

for table_name in profiles user_goals body_profiles nutrition_plans meal_records; do
  assert_count "$table_name" 1 "$user_a"
  assert_count "$table_name" 0 "$user_b"
done

profile_name="Phase 1 User A ${run_id}"
updated_profile="$(curl -sS --fail-with-body -X PATCH "$api_url/rest/v1/profiles?id=eq.$user_a&select=nickname" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a" \
  -H 'content-type: application/json' -H 'prefer: return=representation' \
  --data "$(jq -nc --arg nickname "$profile_name" '{nickname: $nickname}')")"
jq -e --arg nickname "$profile_name" '.[0].nickname == $nickname' >/dev/null <<<"$updated_profile"

foreign_profile_update="$(curl -sS --fail-with-body -X PATCH "$api_url/rest/v1/profiles?id=eq.$user_a&select=nickname" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_b" \
  -H 'content-type: application/json' -H 'prefer: return=representation' \
  --data '{"nickname":"attacker"}')"
[[ "$(jq -er 'length' <<<"$foreign_profile_update")" == "0" ]]

goal_update="$(curl -sS --fail-with-body "$api_url/rest/v1/user_goals?select=id,is_current" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a" \
  -H 'content-type: application/json' -H 'prefer: return=representation' \
  --data "$(jq -nc --arg user_id "$user_a" '{user_id: $user_id, goal_type: "performance", target_weight_kg: 72.5}')")"
jq -e '.[0].is_current == true' >/dev/null <<<"$goal_update"
current_goal_count="$(curl -sS --fail-with-body "$api_url/rest/v1/user_goals?is_current=eq.true&select=id" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a")"
[[ "$(jq -er 'length' <<<"$current_goal_count")" == "1" ]]

body_update="$(curl -sS --fail-with-body "$api_url/rest/v1/body_profiles?select=id,is_current" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a" \
  -H 'content-type: application/json' -H 'prefer: return=representation' \
  --data "$(jq -nc --arg user_id "$user_a" '{user_id: $user_id, age: 30, sex: "undisclosed", height_cm: 170, weight_kg: 66.5, activity_level: "light", training_days_per_week: 2}')")"
jq -e '.[0].is_current == true' >/dev/null <<<"$body_update"
current_body_count="$(curl -sS --fail-with-body "$api_url/rest/v1/body_profiles?is_current=eq.true&select=id" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a")"
[[ "$(jq -er 'length' <<<"$current_body_count")" == "1" ]]

request_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
meal_name="Phase 1 CRUD ${run_id}"
meal_payload="$(jq -nc --arg user_id "$user_a" --arg name "$meal_name" --arg request_id "$request_id" \
  '{user_id: $user_id, name: $name, meal_type: "lunch", client_request_id: $request_id, recorded_at: "2026-07-16T12:00:00Z"}')"
created_meal="$(curl -sS --fail-with-body "$api_url/rest/v1/meal_records?select=*" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a" \
  -H 'content-type: application/json' -H 'prefer: return=representation' \
  --data "$meal_payload")"
meal_id="$(jq -er '.[0].id' <<<"$created_meal")"

item_payload="$(jq -nc --arg meal_id "$meal_id" \
  '{meal_record_id: $meal_id, name: "Test chicken", confirmed_quantity_g: 150, calories_per_100g: 120, protein_g_per_100g: 24, carbs_g_per_100g: 0, fat_g_per_100g: 2}')"
item_response="$(curl -sS -w $'\n%{http_code}' "$api_url/rest/v1/meal_items" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a" \
  -H 'content-type: application/json' -H 'prefer: return=representation' \
  --data "$item_payload")"
item_status="${item_response##*$'\n'}"
item_body="${item_response%$'\n'*}"
if [[ "$item_status" != "201" ]]; then
  echo "meal item insert failed ($item_status): $item_body" >&2
  exit 1
fi

meal_after_item_response="$(curl -sS -w $'\n%{http_code}' "$api_url/rest/v1/meal_records?id=eq.$meal_id&select=calories_kcal,protein_g,carbs_g,fat_g" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a")"
meal_after_item_status="${meal_after_item_response##*$'\n'}"
meal_after_item="${meal_after_item_response%$'\n'*}"
if [[ "$meal_after_item_status" != "200" ]]; then
  echo "meal total read failed ($meal_after_item_status): $meal_after_item" >&2
  exit 1
fi
jq -e '.[0] | .calories_kcal == 180 and .protein_g == 36 and .carbs_g == 0 and .fat_g == 3' \
  >/dev/null <<<"$meal_after_item"

duplicate_status="$(curl -sS -o /dev/null -w '%{http_code}' "$api_url/rest/v1/meal_records" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a" \
  -H 'content-type: application/json' --data "$meal_payload")"
[[ "$duplicate_status" == "409" ]]

foreign_read="$(curl -sS --fail-with-body "$api_url/rest/v1/meal_records?id=eq.$meal_id&select=id" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_b")"
[[ "$(jq -er 'length' <<<"$foreign_read")" == "0" ]]

invalid_meal_status="$(curl -sS -o /dev/null -w '%{http_code}' "$api_url/rest/v1/meal_records" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a" \
  -H 'content-type: application/json' \
  --data "$(jq -nc --arg user_id "$user_a" '{user_id: $user_id, name: "Invalid meal", meal_type: "invalid"}')")"
[[ "$invalid_meal_status" == "400" ]]

for suffix in one two; do
  paged_request_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  curl -sS --fail-with-body "$api_url/rest/v1/meal_records" \
    -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a" \
    -H 'content-type: application/json' \
    --data "$(jq -nc --arg user_id "$user_a" --arg request_id "$paged_request_id" --arg suffix "$suffix" \
      '{user_id: $user_id, name: ("Pagination " + $suffix), meal_type: "snack", client_request_id: $request_id, recorded_at: "2026-07-16T18:00:00Z"}')" \
    >/dev/null
done

paged_meals="$(curl -sS --fail-with-body "$api_url/rest/v1/meal_records?select=id,name&recorded_at=gte.2026-07-16T00:00:00Z&recorded_at=lt.2026-07-17T00:00:00Z&order=recorded_at.desc,id.desc&limit=2&offset=0" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a")"
[[ "$(jq -er 'length' <<<"$paged_meals")" == "2" ]]

atomic_request_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
atomic_payload="$(jq -nc --arg request_id "$atomic_request_id" '{p_input: {clientRequestId: $request_id, name: "Atomic meal", mealType: "dinner", recordedAt: "2026-07-16T19:00:00Z", items: [{name: "Atomic salmon", confirmedQuantityG: 100, caloriesPer100g: 200, proteinGPer100g: 20, carbsGPer100g: 0, fatGPer100g: 12}]}}')"
atomic_response="$(curl -sS -w $'\n%{http_code}' "$api_url/rest/v1/rpc/save_meal_atomic" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a" \
  -H 'content-type: application/json' --data "$atomic_payload")"
atomic_status="${atomic_response##*$'\n'}"
atomic_result="${atomic_response%$'\n'*}"
if [[ "$atomic_status" != "200" ]]; then echo "atomic meal failed ($atomic_status): $atomic_result" >&2; exit 1; fi
jq -e '.meal.name == "Atomic meal" and (.items | length) == 1' >/dev/null <<<"$atomic_result"

curl -sS --fail-with-body -X PATCH "$api_url/rest/v1/meal_records?id=eq.$meal_id" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a" \
  -H 'content-type: application/json' --data '{"deleted_at":"2026-07-16T13:00:00Z"}' >/dev/null
archived_read="$(curl -sS --fail-with-body "$api_url/rest/v1/meal_records?id=eq.$meal_id&deleted_at=is.null&select=id" \
  -H "apikey: $anon_key" -H "authorization: Bearer $access_token_a")"
[[ "$(jq -er 'length' <<<"$archived_read")" == "0" ]]

echo "Auth, RLS isolation, direct CRUD, idempotency, calculated totals, pagination, date filtering, and archive checks passed."
