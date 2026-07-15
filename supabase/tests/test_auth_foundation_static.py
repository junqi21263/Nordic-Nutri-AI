from pathlib import Path
import unittest


ROOT = Path(__file__).parents[2]
FUNCTION = ROOT / "supabase" / "functions" / "auth-helper" / "index.ts"
AUTH_SERVICE = ROOT / "mini-program" / "src" / "services" / "auth"


class AuthFoundationStaticTest(unittest.TestCase):
    def test_auth_helper_requires_a_jwt_and_returns_a_minimal_user(self):
        self.assertTrue(FUNCTION.exists(), "auth-helper Edge Function must exist")
        content = FUNCTION.read_text(encoding="utf-8")
        self.assertIn("requireUser", content)
        self.assertIn("requireMethod", content)
        self.assertIn("withRequestContext", content)
        self.assertIn("success", content)
        self.assertIn("id: user.id", content)
        self.assertIn("email: user.email", content)

    def test_mini_program_auth_boundary_has_no_privileged_or_wechat_logic(self):
        required_files = ("types.ts", "login.ts", "session.ts", "user.ts", "index.ts")
        for filename in required_files:
            self.assertTrue((AUTH_SERVICE / filename).exists(), filename)

        content = "\n".join(
            (AUTH_SERVICE / filename).read_text(encoding="utf-8")
            for filename in required_files
        ).lower()
        self.assertNotIn("service_role", content)
        self.assertNotIn("wechat_app_secret", content)
        self.assertNotIn("wx.login", content)
        self.assertIn("signinwithpassword", content)
        self.assertIn("refreshsession", content)
