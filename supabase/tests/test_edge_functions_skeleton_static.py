from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1] / "functions"
PROTECTED_FUNCTIONS = (
    "generate-plan",
    "analyze-food",
    "calculate-nutrition",
    "meal-summary",
    "coach-answer",
    "save-meal",
)


class EdgeFunctionsSkeletonStaticTest(unittest.TestCase):
    def test_shared_boundary_and_function_entries_exist(self):
        for shared_file in ("auth.ts", "errors.ts", "middleware.ts", "response.ts", "types.ts"):
            self.assertTrue((ROOT / "_shared" / shared_file).exists(), shared_file)

        for function_name in PROTECTED_FUNCTIONS:
            content = (ROOT / function_name / "index.ts").read_text(encoding="utf-8")
            self.assertIn("Deno.serve", content)
            self.assertIn("requireUser", content)
            self.assertIn("notImplemented", content)

        public_login = (ROOT / "wechat-login" / "index.ts").read_text(encoding="utf-8")
        self.assertIn("Deno.serve", public_login)
        self.assertIn("notImplemented", public_login)

        auth_helper = ROOT / "auth-helper" / "index.ts"
        self.assertTrue(auth_helper.exists(), "auth-helper")

        response = (ROOT / "_shared" / "response.ts").read_text(encoding="utf-8")
        self.assertIn("request_id", response)
        self.assertIn("error", response)
