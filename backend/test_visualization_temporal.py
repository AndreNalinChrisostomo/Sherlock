import unittest

import polars as pl

from autoai_api import apply_visualization_node, visualization_result


class VisualizationTemporalTests(unittest.TestCase):
    def test_cast_to_date_keeps_datetime_schema_and_iso_values(self):
        frame = pl.DataFrame({"created_at": ["2026-08-01", "invalid"], "amount": [10, 20]})

        converted = apply_visualization_node("cast", frame, {"column": "created_at", "target": "date"})
        result = visualization_result(converted, "date-node", 1, 2, include_full=True)

        self.assertEqual("datetime", next(column["type"] for column in result["schema"] if column["name"] == "created_at"))
        self.assertEqual("2026-08-01T00:00:00.000", result["chartRows"][0]["created_at"])
        self.assertIsNone(result["chartRows"][1]["created_at"])

    def test_cast_to_date_with_year_format_extracts_year(self):
        frame = pl.DataFrame({"created_at": ["01/01/2010", "02/01/2011", "invalid"]})

        converted = apply_visualization_node("cast", frame, {"column": "created_at", "target": "date", "dateFormat": "%Y"})
        result = visualization_result(converted, "date-node", 1, 3, include_full=True)

        self.assertEqual("number", next(column["type"] for column in result["schema"] if column["name"] == "created_at"))
        self.assertEqual(2010, result["chartRows"][0]["created_at"])
        self.assertEqual(2011, result["chartRows"][1]["created_at"])
        self.assertIsNone(result["chartRows"][2]["created_at"])

    def test_cast_to_date_supports_partial_and_combined_formats(self):
        frame = pl.DataFrame({"created_at": ["2026-08-01T14:35:00", "2025-02-03T09:07:00"]})

        month = apply_visualization_node("cast", frame, {"column": "created_at", "target": "date", "dateFormat": "%m"})
        self.assertEqual([8, 2], month["created_at"].to_list())

        month_year = apply_visualization_node("cast", frame, {"column": "created_at", "target": "date", "dateFormat": "%m/%Y"})
        self.assertEqual(["08/2026", "02/2025"], month_year["created_at"].to_list())

        clock = apply_visualization_node("cast", frame, {"column": "created_at", "target": "date", "dateFormat": "%H:%M"})
        self.assertEqual(["14:35", "09:07"], clock["created_at"].to_list())

    def test_unique_node_returns_distinct_values_in_order(self):
        frame = pl.DataFrame({"year": [2020, 2021, 2020, 2022]})
        converted = apply_visualization_node("unique", frame, {"column": "year"})
        self.assertEqual([2020, 2021, 2022], converted["year"].to_list())


if __name__ == "__main__":
    unittest.main()
