I have enough material. Let me deliver a focused comparative review of the implementations in the workspace, highlighting the most important bugs and improvements.

## Summary of implementations reviewed

- **0!_co48t.html** – "Concave square, XY-wrap, velocity-swap"
- **0!_glm52max.html** – Most polished, impulse-based, wrap-aware, with COM/HUD/controls
- **0_laguna21.html** – 4 inner walls + field-bounce, no wrap
- **0_sf37.html** – 4 wall rects (frame minus hole), wrap via 3×3 tile search
- **0_s37b_bug_ball_escape.html** – Variant with thin wall colliders
- **0_q36ct.html** – Per-edge checkWall with wrap-aware range test
- **0_q36t diz.html** – Simplest: bounce in hole-relative frame
- **01_hy3.html** – Full rotation + angular momentum (different physics model)

---

## Bugs

### 1. `0!_co48t.html` – Wall collides with the *square itself* (false positive on every frame)

After the velocity swap, you seat the ball at `square.x ± LIMIT` and that's fine, but the next substep's `delta(ball.x, square.x)` may be exactly `±LIMIT` and the test `rx > LIMIT` fails correctly. The real problem is at the **outer edge**: the ball, when traveling fast, can sit at the *inner* wall (`rx = +LIMIT`) and on the same step also report being "outside" via the *outer square* geometry — but the inner wall check uses `(ball.vx - square.vx) > 0` and the outer would need its own check. There is no outer check, so the ball can never escape the *square*, but it can also never transfer momentum through the **outer wall** if the square is somehow pushed into the field border. More importantly, the inner-wall logic only handles X and Y independently: a fast ball at a corner can touch both walls in one substep and the second swap is applied on top of the first, **double-swapping** the velocities and reinflating them. The condition `if (...) ... else if (...)` would prevent double-swap only if the same axis isn't touched twice — but the test on Y is independent of X, so simultaneous corner hits are fine; however, after the X swap the position is reset to `square.x + LIMIT`, which is now on the wall, and the *Y* test is computed from the *new* `ball.x` — but Y is unaffected, so that's actually OK. **Real bug**: there is no check that `ball.x` has not already moved past `±LIMIT` by more than the wall thickness, so a very large `dt` / `vx` can tunnel completely through the hole and end up inside the frame body, where no test catches it. Add a "did the ball skip the wall?" check, e.g. a swept test, or simply reduce the per-step travel under `R`.

### 2. `0!_co48t.html` – `wrap(square.x ± LIMIT)` for `LIMIT=45` is wrong when `square.x` is near the seam

When `square.x > F - LIMIT`, `wrap(square.x + LIMIT)` correctly wraps to the next tile, but the **delta** used to detect the collision is already shortest-torus, so the ball was conceptually adjacent *across* the seam. Re-seating it at `wrap(square.x + LIMIT)` puts it on the same side of the seam as the square — **inconsistency**: in a few frames the ball teleports to a visually different tile. The draw loop then renders the ball at `ball.x + k*F` for the *k* matching its new wrapped value, but the square's tile overlay uses *its own* k. They can be drawn in different tiles and look like a wrap jump. Fix: keep the ball in the same toroidal copy as the square after a contact, or draw using a single shared "primary tile" anchor for both.

### 3. `0!_co48t.html` – Square and ball starting position is identical → no relative velocity check ever triggers

Both start at `(F/2, F/2)`. The ball has v=(213,137) and the square is still, so the first collision works because the ball moves first. OK, but **Kick** only adds to `ball.vx/vy`; it does not change `square.vx/vy`, so the "kick" feels like a re-kick of the ball, not a true two-body impulse. Minor: consider a button that splits impulse into both bodies to conserve momentum when at rest (kick = 0 Σp).

### 4. `0_laguna21.html` – No toroidal wrap at all; `resolveFrameFieldWalls` will trap the square at the field edge

The square reflects off the field border and the ball can hit either the inner walls or the field border. After enough hits the square's velocity components can be repeatedly clamped, which **does not conserve momentum** (kinetic energy of the system *increases*? No: reflection preserves it, but the ball+frame system now has a hard wall injecting an external impulse). Plus the `m1,m2` formula in `resolveBallFrameCollisions` is the standard impulse formula and is correct, but `ball.x += (BALL_R - dist) * w.nx` is only applied if `dist < BALL_R`, which means **the ball is pushed out by `(BALL_R - dist)`** — a single-step pushout, *not* a split correction, so the square doesn't move to make room. With a heavy frame this is fine, but if `FRAME_MASS != BALL_MASS` (it isn't here) it's a soft bug. The bigger bug: the field is 1024, frame is 200, so when the frame is pushed against the field wall the ball can be **between** the inner wall and the field wall — there's no collision for the *outer* square body. The ball passes through the frame's outer face. Add outer-wall collision if wrap is disabled.

### 5. `0_sf37.html` – Wall construction puts walls at the wrong Y when the hole isn't centered

```
{ x: sx, y: sy, w: sw, h: hy }                                  // top bar
{ x: sx, y: sy + hy + hh, w: sw, h: sh - hy - hh }              // bottom bar
{ x: sx, y: sy + hy, w: hx, h: hh }                             // left bar
{ x: sx + hx + hw, y: sy + hy, w: sw - hx - hw, h: hh }        // right bar
```
The wall rects overlap at the corners (top-left wall is also covered by left wall), and the 3×3 tile search iterates **for each wall** — 4 walls × 9 tiles = 36 `rectCircleCollision` calls per frame. Correct but wasteful; precomputing 4 walls once and translating only the ball is enough. Real bug: when the square is near the seam, `wrapPos` shifts `square.x` but **the four wall rects are built from the un-shifted `square.x` in `getWalls()`**. In this file `getWalls` is called *after* `wrapPos` so it's fine; OK.

The actual bug: `applyImpulse` divides by `totalMass` for the *positional* correction (`corr = penetration / totalMass`) and then moves the ball by `nx * corr * square.mass` and the square by `-nx * corr * ball.mass`. With `ball.mass == square.mass == 1` that's `penetration/2` for each, correct. But the **velocity** change is `j = -dvDotN` (i.e. impulse magnitude is the negative of relative normal velocity), without the `1+e` factor and without dividing by inverse-mass sum. With equal masses this *happens* to swap the normal component exactly — which is what they want — but with unequal masses (e.g. `BALL_MASS=1, SQ_MASS=9`) the formula is wrong: you would over-impart momentum. Hardcoded assumption.

### 6. `0_s37b_bug_ball_escape.html` – The filename says "ball escape"; here's why:

The `resolveBallSquare` is called 8 times (4 inner + 4 outer walls) with degenerate `ww=1, wh=1` slabs at `wx, wy`. These are *thin line segments*, not extended walls, so the test is `closestPoint(bx, by, wx, wy, 1, 1)` which clamps the ball to the 1×1 square and computes `dist = hypot(bx-cp.x, by-cp.y)`. **Bug**: when the ball is far from the 1×1 line, the closest point is the corner of that 1×1 square, so `dist` is the diagonal distance to the corner — not the perpendicular distance to the wall. With `BALL_R=5`, the ball can be up to `5*sqrt(2) ≈ 7.07` away from the wall and still register a collision. The "ball escapes" because the test fires spuriously near corners and pushes the ball with a wrong normal. Use infinite-extent half-plane walls (signed distance to a line), or AABB collision against the full square body.

Also: `resolveFieldWalls` is called **after** the 8 wall resolutions but **clobbers** the ball and square velocities: it does `result.bvx = Math.abs(result.bvx)` regardless of the *direction* of the relative motion — that injects kinetic energy on every field bounce when the ball hits the field wall with inward velocity. With wrap enabled the field wall should be unused; with wrap disabled this is the only place energy is wrong.

### 7. `0_q36t diz.html` – Wall normals point the wrong way; square can punch through the ball

`ball.vx *= -1; ball.vy *= -1;` is a hard bounce; the square's velocity is *not* updated, so the system gains/loses momentum and energy. Also: `holeHalf = 50` but the `HOLE_SIZE` drawn is `100`, so the playable hole is 50 wide instead of 100 (i.e. `HOLE_SIZE/2`, not the inner edge measured from the square's center). Draws the hole at `square.x + (square.w - 100)/2 = square.x + 50` and `square.y + 50`, with `holeHalf=50` — these match. OK. The bigger bug: the velocity is not split between ball and square, so Σp and ΣKE are not conserved at all (a stated property of the problem).

### 8. `01_hy3.html` – Moment of inertia and rotation is genuinely the most ambitious; real issues:

- **(a)** The wrap helper is `(obj.cx % FIELD + FIELD) % FIELD` and adds the *delta* to `ball.bx`. But `ball.bx` is also advanced by `ball.bvx * h` *after* the wrap — actually no, wrap is called *after* both integrations, so the delta is `0` in the common case. When `obj.cx` jumps by exactly one full field (`1024`), the delta is `0` and `ball.bx` is unchanged, but `obj.cx` is now in a different tile, so the relative position changes. Correct.
- **(b)** `I_FRAME` divides by `AREA` (line 76): `I = (1/AREA) * (1/12)*(OUTER^4 - HOLE^4)`. The `(1/12) * (a^4 - b^4)` part is the *second moment of area* of the frame, not the moment of inertia of a uniform solid frame. To get moment of inertia you need to multiply by *density* and integrate, which for a 2D lamina of uniform surface density σ gives `I = σ * (1/12) * (a^4 - b^4)`. Dividing by `AREA` and using equal masses then maps that to "frame of mass 1" — **but only if σ=1/AREA**, i.e. the formula is implicitly `I = (1/AREA) * (1/12) * (a^4 - b^4)`, which is the second moment divided by the area, i.e. the **radius of gyration squared**. Off by a factor of `AREA`. So `omega` evolves ~AREA× too slowly; the square barely spins after a hit. Concretely, with `OUTER=200, HOLE=100, AREA=30000`, the formula gives `I = 1/30000 * (1/12) * (1.6e9 - 1e8) ≈ 4166.7`, which is enormous. So `obj.omega` never grows much; the angular system is effectively frozen.
- **(c)** `collide()` computes `cross = rcx * ny - rcy * nx` but `rcy` is the **world** coordinate of the contact, while `nx, ny` are also world. That's correct for the 2D cross product of position with normal. OK.
- **(d)** The "rotation" toggle turns off impulses but not the existing `omega`. Line 330: `if (!rotationEnabled) obj.omega = 0;` — that's fine on toggle, but if `rotationEnabled=false` at startup (the default is `true`), no issue. OK.

### 9. `0!_glm52max.html` – The "best" implementation, but two real concerns:

- **(a)** The collision test uses **inward** normals into the hole only. If the ball ever ends up *inside* the frame body (e.g. due to a single huge `dt` that tunnels through the wall), none of the four conditions `d > 0` will fire because the test is one-sided (ball-vs-inner-wall). Add a parallel "outer wall" check so tunneling shows up as a visible correction rather than a stuck ball.
- **(b)** The `step()` integrates first, then `resolveWalls`. With a fixed sub-step of `1/240` and `ball.vx` up to ~2000 px/s (after a kick with `timeScale=2`), one step is `~8.3 px`, more than `R=5`. Not a tunnel *yet*, but a kick button that overwrites velocity without bound would tunnel. Cap `|v|`.
- **(c)** `resolveWalls` uses `inner = OFF` (=50) and `outer = OFF + HOLE` (=150), but `OFF` is the half-thickness of the frame's walls measured from the square's *corner*, not from the center. So the inner edges are at ±50 from the square's center (good) and the outer edges at ±150 (good). Correct.
- **(d)** `drawCOM` uses `MS * (SQ/2) + MB * relBX`, but `SQ/2` is the offset of the square's *geometric center* from its top-left corner, while `relBX` is the ball's offset from the square's *top-left corner* (not center). The square's center is at `(sq.x + SQ/2, sq.y + SQ/2)`, and `relBX = ball.x − sq.x` (wrap). So the COM x is:
  ```
  comX = sq.x + (MS * (SQ/2) + MB * relBX) / MT
       = sq.x + (1*100 + 1*relBX)/2
       = sq.x + 50 + relBX/2
  ```
  Geometric center of the frame is `sq.x + 100`; the ball is at `sq.x + relBX`. So COM should be `(sq.x + 100 + sq.x + relBX)/2 = sq.x + 50 + relBX/2`. **Correct** (the `SQ/2` was meant to be the offset from `sq.x` to the frame center). 

### 10. `0_q36ct.html` – `Math.round` and `(wallCoord - ballPos) / size` integer wrap

```
const offset = Math.round((wallCoord - ballPos) / size);
const adjustedWall = wallCoord - offset * size;
```
With `size = 1024` and a wall position near the wrap boundary, `offset` can be `±1`. The intent is "snap wallCoord to the ball's tile," but `Math.round` is the wrong tool for *any* offset > 0.5; it would give `offset=0` when the ball is one tile away, leading to a `dist` near 1024 — and then `Math.abs(dist) < BALL_R` is false, so no collision. With small velocities this is OK; with large velocities after a kick the ball can "miss" the wall on the next tile and the test simply doesn't fire on the wrap boundary. Use `Math.floor`/`Math.trunc` based on a continuous offset. Also: `ballVx = sqVx` is a *swap* of one component, correct for equal masses, but `sqVy` is not touched by the X-wall check — correct.

---

## Improvements (most valuable, ranked)

1. **Use a single physics core, parameterize it.** The 0!_glm52max.html approach (impulse + swept AABB with inner/outer normals, fixed sub-step, wrap-relative coords) is the cleanest. Refactor everyone toward that.

2. **Conservation invariants in the HUD.** Show Σp, |Σp|, ΣKE, and ideally the COM position. `0!_glm52max.html` does this well; `0!_co48t.html` does it but shows components only. The drift in |Σp| is the most useful single number for "did I break the physics?"

3. **Sub-step on `dt * speed`, not just `dt`.** `0!_co48t.html` uses `N=6` always, which is wasteful at low speed. `0!_glm52max.html` uses a fixed `FIXED = 1/240` accumulator and clamps — better.

4. **Cap `|v|` per body to `R / dt`** to prevent tunneling. None of these cap.

5. **Always render with toroidal ghost tiles.** `0!_co48t.html` and `0!_glm52max.html` do (good). `0_sf37.html` draws only one copy. `0_q36t diz.html` only draws one — and the wrap is real, so the ball appears to "teleport" off the right edge.

6. **DPR / HiDPI scaling.** Every file draws at 1024×1024 onto a 1024×1024 canvas. On a 4K display the canvas is upscaled blurry. Use `canvas.width = 1024; canvas.style.width = ...; ctx.setTransform(dpr, ...)` — or use CSS `image-rendering: pixelated` like `01_hy3.html`.

7. **Tunneling guard for the inner wall.** Swept test: if `(rx_prev, ry_prev)` was inside and `(rx, ry)` is outside the same wall, and the relative velocity points outward, do the bounce. Without this, a kick at `120–280` px/s with `dt=1/60` and `R=5` is fine; with `R=5` and `|v|>300` px/s (kick in `0!_co48t.html` adds 120–280 on top of an already-moving ball) it's marginal.

8. **Pause/reset should also clear the trail and re-seed initP/initKE.** `0!_glm52max.html` does it via `initState`; `0!_co48t.html` resets positions but the trail and the initial KE baseline are never captured, so the HUD has no "before" reference.

9. **The hole visual should be carved with `evenodd` fill or four rects.** `0!_co48t.html` draws an outer rect filled solid, then a `HOLE×HOLE` rect filled with background. Works, but if you ever add transparency/glow it will look wrong. `01_hy3.html` uses the proper `evenodd` rule.

10. **Use `requestAnimationFrame` with a single `loop(now)` parameter and clamp `dt`.** All of them do this (good). The clamp value differs (0.05 vs 0.25 vs 1/30) — pick `1/30` so a backgrounded tab resumes in one second rather than in half a second or twenty seconds.

11. **The "Kick" button should add equal-and-opposite to the *system* if you want to study the "ball in moving frame" behavior.** `0!_co48t.html`'s kick only nudges the ball. To show COM drift, kick half to each, or kick only the ball and then verify the COM is not stationary.

12. **`01_hy3.html` fix #8 above (I_FRAME)**: replace with
    ```
    const I_FRAME = (1/12) * (Math.pow(OUTER,4) - Math.pow(HOLE,4)) / (Math.pow(OUTER,2) - Math.pow(HOLE,2));
    // = second moment of area / area, times AREA = (1/12) * (a^2 + b^2) for an annular frame
    ```
    Actually for a uniform-density frame (mass = σ·AREA with σ=1/AREA so total mass = 1), `I = σ·(1/12)·(a^4 − b^4) = (1/12)·(a^4 − b^4)/AREA`. That's exactly what the file has, so it's correct. **My concern was wrong** — for mass=1 frame, `I = (1/12)·(a^4 − b^4) / (a^2 − b^2)`. The denominator is `AREA = a^2 − b^2 = 30000`, not `30000^2`. So `I = 1/12 · (1.6e9 − 1e8) / 30000 ≈ 4166.7`. The square is *very* rotationally heavy because the lever arm is the full outer size. With ball mass 1, an off-center collision with `r≈0.07` and `Δv≈400` gives `j ≈ 1·Δv` and `Δω = j·r/I ≈ 28·0.07/4167 ≈ 0.0005 rad/s`. So the square barely spins — not a bug, but the visualization will feel "frozen." Consider giving the user a separate "kick square" button that injects angular momentum directly.

13. **DPR scaling, as above.** Important for visual quality on retina/4K.

14. **Edge case: ball exactly at `LIMIT`.** In `0!_co48t.html`, after a swap the ball is placed at `square.x + LIMIT`, then the next substep advances it again — fine, but the *first* substep of a frame with `ball.vx` just swapped now has the ball moving in the opposite direction at the new (square's old) velocity. The second wall on the opposite side won't fire because `rx < -LIMIT` is false. OK.

15. **Off-by-one in `0_q36ct.html` line 49**: `Math.round((wallCoord - ballPos) / size)`. If `wallCoord = 1000` and `ballPos = 24`, then `(1000-24)/1024 ≈ 0.95`, `Math.round → 1`, `adjustedWall = 1000 - 1024 = -24`, `dist = 24 - (-24) = 48`. With `BALL_R=5`, no collision fires. If the wall is on the *other* side (so we want a collision), the formula silently misses it. Use `Math.floor`.

16. **The `0!_co48t.html` "Kick" button** also makes the ball a single-body system, breaking the "ball AND square both have mass" promise. Add a "Kick square" button.

---

## TL;DR

- **Best overall**: `0!_glm52max.html` — impulse-based, wrap-aware, fixed-step accumulator, conservation HUD. Two minor risks (no outer-wall guard, no velocity cap).
- **Best for studying angular momentum**: `01_hy3.html` — adds full rigid-body rotation, but visualization will be subtle because the frame's moment of inertia is large.
- **Most buggy**: `0_s37b_bug_ball_escape.html` (degenerate 1×1 wall slabs → corner-distance false positives; field-wall energy injection) and `0_q36t diz.html` (square is decorative; physics is a 1D bounce with no two-body coupling).
- **Common issues across all files**: no `|v|` cap → tunneling risk; no DPR scaling; HUD shows current state but not conservation drift in some; only one copy rendered in some (no ghost tiles).