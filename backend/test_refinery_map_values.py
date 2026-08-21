import unittest

import polars as pl

from autoai_api import RefineryStepRequest, apply_refinery_step


class RefineryMapValuesTests(unittest.TestCase):
    def test_filters_out_rows_containing_value_with_polars(self) -> None:
        frame = pl.DataFrame({"tipo": ["com vitima", "sem vitima", "com", "sem", "com V", "sem V", "outro"]})
        step = RefineryStepRequest(id="remove-sem", operation="filter-out", column="tipo", value="sem")

        result = apply_refinery_step(frame, step, {"columnProfiles": []})

        self.assertEqual(result["tipo"].to_list(), ["com vitima", "com", "com V", "outro"])

    def test_maps_categorical_variants_with_polars(self) -> None:
        frame = pl.DataFrame({"tipo": ["com vitima", "com", "com V", "sem vitima", "sem", "sem V", "outro"]})
        step = RefineryStepRequest(
            id="map",
            operation="map-values",
            column="tipo",
            value="\n".join(
                [
                    "com vitima => com vitima",
                    "com => com vitima",
                    "com V => com vitima",
                    "sem vitima => sem vitima",
                    "sem => sem vitima",
                    "sem V => sem vitima",
                ]
            ),
        )

        result = apply_refinery_step(frame, step, {"columnProfiles": []})

        self.assertEqual(
            result["tipo"].to_list(),
            ["com vitima", "com vitima", "com vitima", "sem vitima", "sem vitima", "sem vitima", "outro"],
        )

    def test_python_code_transform_returns_isolated_polars_result(self) -> None:
        frame = pl.DataFrame({"km": [1.5, 2.0]})
        step = RefineryStepRequest(
            id="python",
            operation="python-code",
            value='result = df.with_columns((pl.col("km") * 2).alias("km_dobro"))',
        )

        result = apply_refinery_step(frame, step, {"columnProfiles": []})

        self.assertEqual(result["km_dobro"].to_list(), [3.0, 4.0])
        self.assertEqual(frame.columns, ["km"])


if __name__ == "__main__":
    unittest.main()
