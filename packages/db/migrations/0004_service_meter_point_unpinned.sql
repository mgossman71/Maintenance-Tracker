-- Data fix (v0.2.4), companion to 0003: the same never-serviced shortcut
-- "Service" signature, but for tasks whose baseline_meter was never pinned
-- — readings recorded before the baseline column existed. Left alone they
-- count from whatever the odometer currently reads, which both says "due at
-- 1,600" instead of "due at 1,000" AND rotates with every reading, so the
-- service never arrives. Pin them at zero: due exactly AT meter_interval.
UPDATE task
SET baseline_meter = 0
WHERE
  name = 'Service'
  AND months_interval = 12
  AND meter_interval IS NOT NULL
  AND baseline_meter IS NULL
  AND NOT EXISTS (
    SELECT
      1
    FROM
      intervention
    WHERE
      intervention.task_id = task.id
  );
