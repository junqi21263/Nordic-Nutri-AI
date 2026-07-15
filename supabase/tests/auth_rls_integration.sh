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

echo "Auth registration, password login, session refresh, and RLS isolation passed."
