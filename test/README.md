# verification harness

Headless measurement of every `*.html` result in the repo root. Node only, no browser, no deps.
This folder belongs to the analyst agent — it is **never** handed to a model under test.

```
node test/run.js                    all *.html in the repo root
node test/run.js a.html b.html      only these
node test/run.js a.html --vs auto   measure a, compare against the `card best` of the same Round
node test/run.js a.html --vs b.html compare against an explicit baseline
node test/run.js --details          per-check numbers, detected conventions, ball/body field names
node test/run.js --short            6s instead of 10s per battery
SECONDS=30 node test/run.js         longer runs
node test/run.js --fresh            ignore the mtime cache
node test/run.js --help
node test/trace.js a.html --sec=5 --out=t.csv   per-frame ball/body state as CSV
```

`run.js` writes `results.json` (machine readable, merged across runs) and `results.md` (the table).
A run over a subset merges into the snapshot instead of truncating it; entries are re-used when
`mtime`, battery length and harness version are unchanged, so a `--vs` against a baseline already in
the snapshot is instant. Bump `HV` in `run.js` when a check changes, or stale entries are re-measured.

## checks

| check | meaning | trust |
|---|---|---|
| loads / runs without error | no exception in load, rAF or handlers | hard |
| state stays finite | no NaN/Inf in the probed state | hard |
| ball contained in hole1 | `max(|dx|,|dy|)` of ball vs square centre vs 45px; square centre is auto-calibrated by the median offset (some files store the top-left corner). pass <=+2px, warn <=+10, fail = real escape | hard |
| no position teleport | per-frame offset step > 5x its running mean | hard |
| time fidelity | offset path length / integral of relative speed; 1.000 means the sim clock tracks the rAF clock, <1 means a fixed `DT` with no delta | hard while rotation is off, informational while it spins |
| kinetic energy | max relative drift of total KE; tries 4 velocity conventions (relative/absolute x world/rotated) and reports the best | hard for state-probed files, warn for canvas |
| linear momentum | max \|dP\| | same |
| angular momentum (COM) | only exact for wall-only contacts; asymmetric 2-point corner contacts legitimately shift it | soft |
| analytic inertia | file's own I vs 8333.33 = rho(A^4-a^4)/6 | hard |
| spin coupling | off-centre wall hit must produce omega != 0 | hard, skipped when the file has no rotation checkbox (round 0 brief) |
| energy during spin | energy must hold with the rotation checkbox on | hard |

Reference values for this brief: field 1024, square 200, hole 100, wall 50, ball r=5, both masses 1,
I = 8333.33, ball centre limit 45. Put new constants in `lib/checks.js` if the brief changes.

## modules

| file | role |
|---|---|
| `run.js` | CLI, snapshot merge, `--vs` compare + verdict, markdown output |
| `trace.js` | per-frame CSV of ball and body state |
| `lib/sandbox.js` | DOM + canvas2d stub, seeded `Math.random`, virtual clock, rAF pump, synthetic events. Every file runs in a `vm` with no real browser. |
| `lib/load.js` | html -> running sim (`sim.step(seconds)`, checkbox/click/key helpers) |
| `lib/probe.js` | finds the ball/body state in the page: global scan + word list + field aliases (`x\|cx\|bx`, `wx\|bvx\|vx`, `angle\|ang\|a`, `w\|omega`, ...). Rebinds after resets, because several files recreate their state object. |
| `lib/canvas.js` | fallback when the state is private to an IIFE: recovers the ball from `ctx.arc` and the square from the drawn 200x200 rect, velocities by finite difference. |
| `lib/checks.js` | the check battery, `battery()` and `spinProbe()` |
| `lib/adapters.js` | per-file overrides when the probe guesses wrong (`{file: {ball, body, conv}}`) |

## when a check fails

Confirm it is not a harness artefact first. `--details` prints the detected convention, the matched
field names, the kick method and the centre calibration. Add an adapter entry instead of trusting a
`fail` from a convention guess.

- `probe: none` — the state is closure-private, so only `ctx.arc` / drawn-rect recovery was possible.
  Velocities are finite differences of the rendered path, which cannot distinguish a physics bug from
  a rendering seam, and the kick/placement/spin checks are skipped. Treat momentum and angular
  momentum `FAIL`s here as unproven.
- `probe: ball-only` — no body position could be recovered, so containment and teleport are skipped.
- `state stays finite` / `no position teleport` failing together usually means a NaN, not a teleport.
- `time fidelity` far from 1.000 with a fixed `DT` loop is a real defect: the sim speed depends on the
  display refresh rate.
