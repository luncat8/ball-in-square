## ball in square

good looking task to compare local LLM in coding.

task 0 is easy - most LLM solve it somehow and do it fast, but most solve wrong or give partial solution. 

task 01 for creativity testing

### goals

- fast evaluate new model

- analyze reasoning by LLM. think what is difficult. what took most time. how avoid and improve reasoning efficiency

example of low-tier LLM reasoning-dots3-part1.txt

### this repository

https://github.com/luncat8/ball-in-square.git

## draft prompt

### 0 v2026.08.03

game field 1024*1024 xy-wrap
object square1 200*200px has square hole1 100*100 centered (50px walls). square1 mass = 1
implement checkbox that toggle square1 rotation ( keep moment of inertia ).

there is a ball 10px in hole1. ball move and reflect from walls. ball mass = 1
initial ball position centered into hole1. ensure it properly bounce in concave hole1

- perfectly elastic, no friction, no energy loss.
- ball reflects off inner hole1 edges only. prevent tunneling/clip in concave geometry
keep impulse. no round, no loss.

no friction


single html js
1 tab indent

typical bugs:
square1 problem with wrap-xy


- checkbox toggles rotation. off: locked rotation, free translation. on: free rotation+translation, moment of inertia computed analytically for shape with hole

### 0d more difficult - allow hole free rotation

add checkbox that allow hole1 rotation related to parent square1, similar as if was inside ball bearing. mass of partthat rotating along with hole is 0.5 of square1


### 01 add sound synth


'|' mean radio buttons to select one
internal hole1 corners are 0,1,2,3


constant volume | dx -> volume | dDistance from ball to hole1 corner 0 and 2 (same as mean that corners are sound sources and ball is listener - this produce pan effect)
dy -> tone	| y -> tone
phase same (no effect) | dDistance from ball to internal hole1 corner 0 and 2


think what else synth modes may be interesting, implement if found good.

### 015

new mode:
	center is tonic, hole1 edges -> 4 scales = pentatonic
	dist from ball to center and hole1 edges produce slide tone from tonic to 4 tones.
	not a polyphony, but slide.
	because most time ball it between them - need proper easing function like hermeet or something else with locking last tone until some distance and then do musical slide with speed corresponding of ball change distance to edge.


## reasoning analysis

### `reasoning-dots3-part1.txt`:

**What is difficult**

1. **Coupled rigid-body impulse with rotation** — The ball hits a moving, rotating wall. The impulse must simultaneously change the ball’s linear velocity, the square’s linear velocity, *and* the square’s angular velocity. Getting the lever arm, the cross products, and the inertia term into a single scalar `j` is error-prone.

2. **Sign conventions across two frames** — The same collision involves an outward normal in world space, the same normal in the square’s local space, and a contact point relative to the square’s center. It is very easy to flip a sign in the `r × n` term or push the ball in the wrong direction after a wall hit.

How to avoid it

- **Fix the convention once**: decide “normal always points into the cavity” and derive every wall from that.
  - Right wall: `n = (-1, 0)` in local, `R(θ)·(-1, 0)` in world.
  - Left wall: `n = (+1, 0)`.
- **Use the local normal as the source of truth**, then rotate it — never derive the normal from `sign(lx)` alone.

3. **Corner handling in a sequential solver** — A corner is two simultaneous contacts. Resolving one wall first changes the ball’s position (and, if the square is rotated, also changes the *other* wall’s local penetration). The solver has to recompute local coords after each correction, which the initial reasoning did not immediately do.

4. **Wrap semantics** — Deciding whether wrapping is purely cosmetic or affects the physics. The first reasoning explored several options before settling on “cosmetic wrap + delta-shift on boundary cross,” which is the correct minimal-interference choice.

5. **Position correction vs. velocity impulse ordering** — Integrating-then-resolving (the standard order) means the ball can tunnel into a wall in one step. The reasoning correctly identified that small substeps + positional Baumgarte stabilization solves this, but choosing a correction factor that does not over-correct or jitter requires care.

**What took most time**

- Deriving and double-checking the analytic moment of inertia (≈ 25 lines of algebra for `I = (1/6)m(L² + l²)`).
- Re-deriving the impulse formula with rotational inertia and verifying energy conservation (`j = 2·v_n / (1/m_b + 1/m_s + (r×n)²/I)`).
- Wrestling with wrap boundary cases and whether to wrap positions during physics or only at render time.
- Designing the corner-handling strategy (sequential per-wall vs. polygon-closest-point).

**How to avoid and improve reasoning efficiency**

1. **Start from a known minimal reference** — `0!_glm52max.html` already implements the equal-mass, no-rotation case correctly with wrap-aware relative coordinates. Extending that to rotation is much cheaper than deriving everything from first principles.

2. **Use established engine vocabulary** — Name things `outwardNormal`, `contactPoint`, `relativeVelocity`, `penetration`. This prevents sign mistakes.

3. **Separate transforms into helpers** — `worldToLocal(pos)`, `localToWorld(pos)`, `velocityAt(localPoint)`. This makes the rotated-frame math explicit and testable.

4. **Recompute local state inside the wall loop** — After each positional correction, recompute `(u, v)` before testing the next wall. This avoids using stale local coordinates after rotation.

5. **Use a fixed-step accumulator** — `requestAnimationFrame` with a 1/240 s fixed-step accumulator eliminates variable-timestep instability and makes tunneling guarantees easy to reason about.

6. **Add conservation diagnostics from line 1** — Print Σp and ΣKE every frame. If either drifts, the impulse math is wrong. This catches bugs immediately.

7. **Render debug aids** — Draw the contact normal and contact point during development. Visual confirmation is faster than algebraic verification for sign errors.

8. **Keep the solver shallow** — For this brief, 4 substeps × 4 wall iterations × 4 walls = 64 cheap checks per frame. No need for speculative constraints or warm starting.

