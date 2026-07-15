from pathlib import Path
import unittest


SEED = Path(__file__).parents[1] / "seed.sql"


class SeedStaticTest(unittest.TestCase):
    def test_seed_defines_idempotent_food_catalog_test_data(self):
        self.assertTrue(SEED.exists(), "supabase/seed.sql must exist")
        sql = SEED.read_text(encoding="utf-8").lower()

        self.assertIn("insert into public.food_catalog", sql)
        self.assertIn("on conflict do nothing", sql)
        for name in ("鸡胸肉", "白米饭", "燕麦片", "希腊酸奶", "全鸡蛋"):
            self.assertIn(name, sql)
