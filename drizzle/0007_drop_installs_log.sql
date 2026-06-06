INSERT INTO "install_events" ("id", "install_id", "step", "progress", "message", "status", "created_at")
SELECT
	gen_random_uuid()::text,
	i.id,
	'legacy',
	0,
	lines.trimmed_line,
	i.status,
	i.created_at + (lines.line_num * interval '1 millisecond')
FROM "installs" i
CROSS JOIN LATERAL (
	SELECT
		t.ordinality - 1 AS line_num,
		trim(t.line) AS trimmed_line
	FROM unnest(string_to_array(i.log, E'\n')) WITH ORDINALITY AS t(line, ordinality)
) AS lines
WHERE
	i.log IS NOT NULL
	AND btrim(i.log) <> ''
	AND lines.trimmed_line <> ''
	AND NOT EXISTS (
		SELECT 1 FROM "install_events" e WHERE e.install_id = i.id
	);--> statement-breakpoint
ALTER TABLE "installs" DROP COLUMN "log";
