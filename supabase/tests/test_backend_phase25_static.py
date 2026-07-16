from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]
FUNCTION = ROOT / "functions" / "wechat-login" / "index.ts"
MIGRATION = ROOT / "migrations" / "20260716022627_backend_phase25_auth_hardening.sql"


class BackendPhaseTwoPointFiveStaticTest(unittest.TestCase):
    def test_atomic_meal_update_is_security_invoker_and_checks_ownership(self):
        matches = list((ROOT / "migrations").glob("*_phase3a_meal_atomic_update.sql"))
        self.assertEqual(len(matches), 1, "missing Phase 3A atomic meal update migration")
        content = matches[0].read_text(encoding="utf-8")
        for token in (
            "create or replace function public.update_meal_atomic(p_input jsonb)",
            "security invoker",
            "set search_path = ''",
            "v_user_id uuid := auth.uid()",
            "raise exception 'UNAUTHORIZED'",
            "raise exception 'NOT_FOUND'",
            "delete from public.meal_items where meal_record_id = v_meal_id",
            "grant execute on function public.update_meal_atomic(jsonb) to authenticated",
        ):
            self.assertIn(token, content)

    def test_wechat_identity_and_replay_digests_use_server_only_hmac(self):
        content = FUNCTION.read_text(encoding="utf-8")
        self.assertIn('name: "HMAC", hash: "SHA-256"', content)
        self.assertIn("WECHAT_IDENTITY_PEPPER", content)
        self.assertIn('(env === "local" || env === "test")', content)
        self.assertIn('WECHAT_MOCK_ENABLED") === "true"', content)
        self.assertNotIn("console.log", content)
        self.assertNotIn("session_key", content)

    def test_hmac_data_classification_is_recorded_in_schema_metadata(self):
        content = MIGRATION.read_text(encoding="utf-8")
        self.assertIn("HMAC-SHA256", content)
        self.assertIn("WECHAT_IDENTITY_PEPPER", content)

    def test_service_role_has_only_the_identity_bridge_privileges_it_needs(self):
        content = MIGRATION.read_text(encoding="utf-8")
        self.assertIn("grant select, insert on table public.wechat_identities to service_role", content)
        self.assertIn("grant select, insert on table public.wechat_login_codes to service_role", content)

    def test_atomic_meal_save_checks_foreign_asset_analysis_and_plan_ownership(self):
        content = MIGRATION.read_text(encoding="utf-8")
        self.assertIn("public.uploaded_assets", content)
        self.assertIn("public.ai_analysis", content)
        self.assertIn("public.nutrition_plans", content)
        self.assertIn("FORBIDDEN", content)

    def test_save_meal_maps_ownership_violations_to_a_safe_forbidden_response(self):
        content = (ROOT / "functions" / "save-meal" / "index.ts").read_text(encoding="utf-8")
        self.assertIn('new AppError("FORBIDDEN"', content)

    def test_client_database_types_cover_remote_phase_two_schema(self):
        content = (ROOT.parents[0] / "mini-program" / "src" / "api" / "database.types.ts").read_text(encoding="utf-8")
        for token in ("wechat_identities", "wechat_login_codes", "active_meal_records", "save_meal_atomic"):
            self.assertIn(token, content)

    def test_otp_contract_exposes_email_verification_type(self):
        content = FUNCTION.read_text(encoding="utf-8")
        self.assertIn('type: "email"', content)


if __name__ == "__main__":
    unittest.main()
