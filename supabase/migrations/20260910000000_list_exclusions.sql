-- List-scoped exclusions, not a household inventory. Existing lists start empty.
ALTER TABLE shopping_list ADD COLUMN excluded TEXT NOT NULL DEFAULT '{"ids":[],"names":[]}';
