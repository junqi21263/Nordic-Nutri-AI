from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]
MIGRATION = ROOT / "migrations" / "20260716015243_backend_phase1_foundation.sql"
FUNCTIONS = ROOT / "functions"


class BackendPhaseOneStaticTest(unittest.TestCase):
    def test_foundation_migration_defines_user_owned_crud_boundaries(self):
        self.assertTrue(MIGRATION.exists(), "Phase 1 migration must exist")
        sql = MIGRATION.read_text(encoding="utf-8").lower()

        for table_name in (
            "user_settings",
            "uploaded_assets",
            "health_plan_items",
            "coach_conversations",
        ):
            self.assertIn(f"create table public.{table_name}", sql)
            self.assertIn(f"alter table public.{table_name} enable row level security", sql)

        self.assertIn("alter table public.ai_analysis", sql)
        self.assertIn("alter table public.coach_messages", sql)
        self.assertIn("client_request_id", sql)
        self.assertIn("meal_records_user_request_id_key", sql)
        self.assertIn("recalculate_meal_totals", sql)
        self.assertIn("retire_previous_current_goal", sql)
        self.assertIn("retire_previous_current_body_profile", sql)
        self.assertIn("on public.meal_records to authenticated", sql)
        self.assertIn("meal records: users insert own records", sql)
        self.assertIn("meal items: users update own items", sql)

    def test_edge_functions_expose_contract_validation_and_safe_not_implemented_errors(self):
        for name in ("analyze-food", "generate-plan", "coach-answer"):
            content = (FUNCTIONS / name / "index.ts").read_text(encoding="utf-8")
            self.assertIn("parseJsonBody", content)
            self.assertIn("notImplemented", content)
            self.assertIn("assertRequired", content)

        response = (FUNCTIONS / "_shared" / "response.ts").read_text(encoding="utf-8")
        self.assertIn("success: true", response)
        self.assertIn("success: false", response)
        self.assertIn("requestId", response)


if __name__ == "__main__":
    unittest.main()
