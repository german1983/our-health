-- Generalize product_serving_units: each row can now express a conversion
-- against any unit (not just the product's nutrition base). E.g., "1 g = 1 ml"
-- becomes a row with name='g', base_unit_equivalent=1, target_unit='ml',
-- bridging mass and volume for that product.

ALTER TABLE "product_serving_units" ADD COLUMN "target_unit" text;
-- Existing rows have target_unit = NULL, which the conversion engine
-- interprets as "use the product's nutrition_base_unit" — preserves the
-- original semantics of every row created before this change.
