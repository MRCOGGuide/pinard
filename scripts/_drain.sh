#!/usr/bin/env bash
cd /c/dev/pinard
SECRET=$(grep "^CRON_SECRET=" .env.local | cut -d= -f2-)
LOG=/c/dev/pinard/.queue-drain.log
: > "$LOG"
fails=0; made=0; start=$(date +%s)
for i in $(seq 1 800); do
  out=$(curl -s -X POST http://localhost:3000/api/generate/worker \
        -H "authorization: Bearer $SECRET" --max-time 150)
  created=$(printf '%s' "$out" | grep -o '"created":[0-9]*' | tail -1 | cut -d: -f2)
  remaining=$(printf '%s' "$out" | grep -o '"jobs_remaining":[0-9]*' | cut -d: -f2)
  if [ -z "$remaining" ]; then
    fails=$((fails+1))
    echo "$(date +%H:%M:%S) call $i: no response — $(printf '%s' "$out" | head -c 160)" >> "$LOG"
    [ "$fails" -ge 5 ] && { echo "stopped after 5 bad responses" >> "$LOG"; break; }
    sleep 10; continue
  fi
  fails=0; made=$((made + ${created:-0}))
  echo "$(date +%H:%M:%S) call $i: +${created:-0} (total $made) remaining=$remaining elapsed=$(( $(date +%s) - start ))s" >> "$LOG"
  [ "$remaining" = "0" ] && { echo "queue drained" >> "$LOG"; break; }
  sleep 2
done
echo "FINISHED total_created=$made" >> "$LOG"
