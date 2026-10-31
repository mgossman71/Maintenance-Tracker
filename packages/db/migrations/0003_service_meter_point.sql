-- Data fix (v0.2.2): the equipment-creation shortcut created its "Service"
-- task with INTERVAL semantics — "one interval from wherever the odometer
-- sat". Owner intent was always the ABSOLUTE meter point: "first service
-- due AT 1,000 miles", not "1,000 more miles from here".
--
-- Re-anchor the tasks that shortcut created — the exact signature (name
-- "Service", 12-month backstop, a meter interval, a baseline pinned from
-- the first reading) AND never serviced — by counting them from zero, so
-- they are due exactly at meter_interval. Anything with recorded history,
-- every hand-made task, and everything created since the shortcut pinned
-- baseline 0 itself is untouched.
UPDATE task
SET baseline_meter = 0
WHERE
  name = 'Service'
  AND months_interval = 12
  AND meter_interval IS NOT NULL
  AND baseline_meter IS NOT NULL
  AND NOT EXISTS (
    SELECT
      1
    FROM
      intervention
    WHERE
      intervention.task_id = task.id
  );
