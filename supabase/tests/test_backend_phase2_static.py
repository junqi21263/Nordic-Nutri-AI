from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]
MIGRATION = ROOT / "migrations" / "20260716021243_backend_phase2_auth_and_meal_closure.sql"
FUNCTIONS = ROOT / "functions"


class BackendPhaseTwoStaticTest(unittest.TestCase):
    def test_migration_secures_wechat_identity_and_active_meal_default(self):
        sql = MIGRATION.read_text(encoding="utf-8").lower()
        self.assertIn("alter table private.wechat_identities set schema public", sql)
        self.assertIn("enable row level security", sql)
        self.assertIn("create view public.active_meal_records with (security_invoker = true)", sql)
        self.assertIn("function public.save_meal_atomic", sql)
        self.assertIn("security invoker", sql)
        self.assertIn("birth_date", sql)

    def test_wechat_login_uses_only_server_secrets_and_official_otp_bridge(self):
        content = (FUNCTIONS / "wechat-login" / "index.ts").read_text(encoding="utf-8")
        for token in ("WECHAT_APP_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "generateLink", "hashed_token", "code2session"):
            self.assertIn(token, content)
        self.assertNotIn("console.log", content)
        self.assertNotIn("session_key", content)

    def test_save_meal_calls_atomic_rpc_and_never_uses_service_role_for_user_data(self):
        content = (FUNCTIONS / "save-meal" / "index.ts").read_text(encoding="utf-8")
        self.assertIn("save_meal_atomic", content)
        self.assertIn("requireUser", content)
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", content)


if __name__ == "__main__":
    unittest.main()
