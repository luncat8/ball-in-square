
analyze new implementations - we interested in correctness of physics and performance, then code style. be short.

read index and best previous to understand references

add new to index.html

## workflow

1. `node test/run.js <newfile>.html` - headless verification, see below. do this before reading the code,
   it finds real bugs faster than reading 400 lines.
2. read the new file, compare with the best entry in `index.html`, write the card.
3. add the card to the matching `Round` section of `index.html` (tag: best/ok/warn/bug, same markup as the
   existing cards, one `card` per file, issues list = what is actually wrong or unverifiable).

## verification harness (`test/`)

`node test/run.js`                      all `*.html` in the repo root, writes `test/results.{json,md}`
`node test/run.js a.html b.html`        only these
`node test/run.js --details`            per-check numbers, detected conventions, ball/body field names
`node test/run.js --short`              6s instead of 10s per battery
`SECONDS=30 node test/run.js`           longer runs
`node test/trace.js a.html --sec=5 --out=t.csv`   per-frame ball/body state as CSV
`node test/run.js a.html && node test/trace.js a.html`   trace a case that failed

`test/lib/sandbox.js`  DOM + canvas2d stub, seeded `Math.random`, virtual clock, rAF pump, synthetic
                       events. Every file runs in a `vm` with no real browser.
`test/lib/load.js`     html -> running sim (`sim.step(seconds)`, checkbox/click/key helpers).
`test/lib/probe.js`    finds the ball/body state in the page: global scan + word list + field aliases
                       (`x|cx|bx`, `wx|bvx|vx`, `angle|ang|a`, `w|omega`, ...). Rebinds after resets,
                       because several files recreate their state object.
`test/lib/canvas.js`   fallback when the state is private to an IIFE: recovers the ball from `ctx.arc`
                       and the square from the drawn 200x200 rect, velocities by finite difference.
`test/lib/checks.js`   the check battery.
`test/lib/adapters.js` per-file overrides when the probe guesses wrong (add `{file: {ball, body, conv}}`).

## checks

| check | meaning | trust |
|---|---|---|
| loads / runs without error | no exception in load, rAF or handlers | hard |
| state stays finite | no NaN/Inf in the probed state | hard |
| ball contained in hole1 | `max(|dx|,|dy|)` of ball vs square centre vs 45px; square centre is auto-calibrated by the median offset (some files store the top-left corner). pass <=+2px, warn <=+10, fail = real escape | hard |
| no position teleport | per-frame offset step > 5x its running mean | hard |
| time fidelity | offset path length / integral of relative speed; 1.000 means the sim clock tracks the rAF clock, <1 means a fixed `DT` with no delta | hard-ish |
| kinetic energy | max relative drift of total KE; tries 4 velocity conventions (relative/absolute x world/rotated) and reports the best | hard for state-probed files, warn for canvas |
| linear momentum | max \|dP\| | same |
| angular momentum (COM) | only exact for wall-only contacts; asymmetric 2-point corner contacts legitimately shift it, so a warn is normal | soft |
| analytic inertia | file's own I vs 8333.33 = rho(A^4-a^4)/6 | hard |
| spin coupling / energy during spin | off-centre wall hit must produce omega != 0; energy must hold with the rotation checkbox on | hard |

Reference values for this brief: field 1024, square 200, hole 100, wall 50, ball r=5, both masses 1,
I = 8333.33, ball centre limit 45. Put new constants in `test/lib/checks.js` if the brief changes.

When a check fails, first confirm it is not a harness artefact: `--details` prints the detected
convention, the matched field names, the kick method and the calibration. Add an adapter entry instead
of trusting a `fail` from a convention guess. Canvas-probed files (`probe: none`) cannot be state-written,
so kick/placement/spin checks are skipped for them.
