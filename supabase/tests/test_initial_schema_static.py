from pathlib import Path
import unittest


MIGRATION = Path(__file__).parents[1] / "migrations" / "0001_initial_schema.sql"


class InitialSchemaStaticTest(unittest.TestCase):
    def test_initial_schema_contains_all_tables_constraints_indexes_and_rls(self):
        self.assertTrue(MIGRATION.exists(), "initial migration must exist")
        sql = MIGRATION.read_text(encoding="utf-8").lower()

        for table_name in (
            "users",
            "profiles",
            "user_goals",
            "body_profiles",
            "nutrition_plans",
            "meal_records",
            "meal_items",
            "food_catalog",
            "ai_analysis",
            "coach_messages",
        ):
            self.assertIn(f"create table public.{table_name}", sql)
            self.assertIn(f"alter table public.{table_name} enable row level security", sql)

        self.assertIn("create table private.wechat_identities", sql)
        self.assertIn("create or replace function private.handle_new_auth_user()", sql)
        self.assertIn("security definer", sql)
        self.assertIn("set search_path = ''", sql)
        self.assertIn("revoke all on function private.handle_new_auth_user() from public, anon, authenticated", sql)
        self.assertIn("create trigger on_auth_user_created", sql)
        self.assertIn("after insert on auth.users", sql)
        self.assertIn("create trigger set_updated_at", sql)
        self.assertIn("create index meal_records_active_user_recorded_at_idx", sql)
        self.assertIn("create policy \"food images: users insert own objects\"", sql)
        self.assertIn("with check ((select auth.uid()) = user_id)", sql)
        self.assertIn("with check (bucket_id = 'food-images'", sql)
