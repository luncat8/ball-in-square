# analyst role

analyze new implementations — we are interested in **correctness of physics** first, then **performance**,
then **code style**. be short. your job is to measure and compare, **not** to refactor the result.

## layout

| path | what it is |
|---|---|
| `task/` | **the only folder you hand to a model under test** — `task.md` (the brief) + empty `index.html` |
| `test/` | the verification harness, yours only. never copy it into `task/` |
| `index.html` | the comparison board. `card best` entries are the references |
| `NN_model.html` | results, one file per model, named by round (`0_`, `01_`, `02_`) |

## workflow

1. `node test/run.js <newfile>.html --vs auto` — measures the new file and prints it against the
   `best` entry of the same round. do this **before** reading the code; it finds real bugs faster
   than reading 400 lines. `--vs <other>.html` to pick a different baseline.
2. read `<newfile>.html` only for what the harness cannot see: wrap handling, corner solve,
   sub-step clamp, whether the HUD reports the true invariants, per-frame cost, indirection.
3. write the card: `class="card best|note|warn|bug"`, a `row` with name + tags, a one-paragraph
   `desc`, then `ul.issues` = what is **actually wrong or unverifiable** (quote harness numbers,
   name the line). no praise padding, no speculation dressed as fact.
4. add the card to the matching `Round` section of `index.html`, one `card` per file.
5. commit `<newfile>.html`, `index.html`, `test/results.{json,md}`.

## tag rule

- `best` — every hard check passes, no unverifiable physics claim left in the code.
- `note` — physics sound, but something notable (ambition, diagnostics, or a soft-only anomaly).
- `warn` — one hard check warns, or a real but non-fatal defect (no |v| cap, single-tile render, stale HUD baseline).
- `bug` — any hard check fails and you can name the mechanism.

## hard checks

`loads` · `state stays finite` · `ball contained in hole1` · `no position teleport` · `time fidelity` ·
`kinetic energy` · `linear momentum` · `analytic inertia` · `spin coupling` · `energy during spin`.
All are hard except `angular momentum (COM)` (soft: an asymmetric 2-point corner contact legitimately
shifts it) and `time fidelity` while rotation is on (informational).

A `warn` is not a licence to ignore a check, and a `fail` is not proof of a bug until you ruled out a
harness artefact — see `test/README.md`, which also documents the probes, the conventions and the
`--details` output. Identical numbers across two files mean they share a physics core, not that the
harness is broken; check the code before claiming either.
