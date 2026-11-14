import unittest
from unittest.mock import patch
from gift_rules import classify_gift

class GiftRulesTests(unittest.TestCase):
    def test_rose_small(self):
        self.assertEqual(classify_gift('Rose', 1, 1), (1, False))

    def test_cowboy_hat_big(self):
        self.assertEqual(classify_gift('Cowboy Hat', 1, 0), (12, True))

    def test_custom_gift(self):
        with patch.dict('os.environ', {'BIG_GIFTS_JSON': '{"Rocket": 16}'}):
            self.assertEqual(classify_gift('rocket', 1, 1), (16, True))

    def test_price_fallback_and_cap(self):
        self.assertEqual(classify_gift('Other Gift', 100, 200), (24, True))

    def test_rose_streak_does_not_trigger_scratch(self):
        self.assertEqual(classify_gift('Rose', 30, 1), (24, False))

if __name__ == '__main__':
    unittest.main()
