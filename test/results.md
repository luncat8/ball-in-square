# Verification run

field 1024x1024 wrap xy, ball d=10 m=1, square1 200x200 hole 100x100 m=1, I_ref=8333.33, 60fps virtual clock, seed 12345, 6/10s per battery

| file | probe | loads | runs without error | state stays finite | ball contained in hole1 | no position teleport | time fidelity | kinetic energy | linear momentum | angular momentum (COM) | analytic inertia |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `0_laguna21.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | warn (48.850) | ok   (0) | FAIL (0.488) | ok   (0) | FAIL (1922.250) | warn (25590.272) | --   |
| `0_qwen36ct.html` | none | ok   (1.000) | ok   (-1.000) | FAIL (143.000) | FAIL (58.733) | FAIL (51.965) | ok   (1.051) | warn (49.942) | FAIL (1822.000) | warn (22195.000) | --   |
| `0_qwen36t diz.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | FAIL (90.000) | ok   (0) | FAIL (12.281) | ok   (0) | FAIL (1240.000) | warn (3333.924) | --   |
| `0_step37f_bug_ball_escape.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | FAIL (132.310) | ok   (0) | FAIL (0.792) | ok   (0) | FAIL (948.404) | warn (64354.183) | --   |
| `0_step37f.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | FAIL (510.102) | ok   (0) | FAIL (59.831) | ok   (0) | ok   (0) | warn (3.55e+5) | --   |
| `0-dots3.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (46.721) | ok   (0) | ok   (0.982) | FAIL (0.273) | ok   (0) | warn (8795.144) | ok   (8333.333) |
| `0-GPT56luna.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (46.622) | ok   (0) | ok   (0.965) | ok   (0) | ok   (0) | warn (22220.387) | ok   (8333.333) |
| `0!_claude_opus48t.html` | none | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (45.364) | ok   (0) | ok   (0.997) | warn (0.490) | FAIL (412.378) | warn (9825.330) | --   |
| `0!_glm52max.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (46.528) | ok   (0) | ok   (0.990) | ok   (0) | ok   (0) | warn (6697.408) | --   |
| `01_hy3.html` | object | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (45.335) | ok   (0) | ok   (0.968) | ok   (0) | ok   (0) | warn (31328.938) | --   |
| `01_ornith1.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (45.499) | ok   (0) | ok   (0.980) | FAIL (0.329) | ok   (1.14e-13) | warn (11458.877) | --   |
| `01_ornith15.html` | ball-only | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | --   | --   (0) | --   | ok   (0) | ok   (0) | warn | --   |
| `01_qwen38_27b_hermes.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (45.891) | ok   (0) | ok   (0.970) | ok   (0) | ok   (0) | warn (20831.531) | --   |
| `01_qwen38_27b_i4.htm` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (46.003) | ok   (0) | ok   (0.972) | ok   (0) | ok   (0) | warn (14005.035) | --   |
| `01-space-bunny-Alpha.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (45.503) | ok   (0) | ok   (0.966) | ok   (0) | ok   (0) | warn (33973.198) | ok   (8333.333) |
| `01-step5prev-1400s.html` | none | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (45.560) | ok   (0) | ok   (0.998) | warn (0.225) | FAIL (33.338) | warn (13065.480) | --   |
| `01!_claude48ot_c46_rot.html` | none | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (44.902) | ok   (0) | ok   (0.997) | warn (0.477) | FAIL (412.378) | warn (10078.186) | --   |
| `01!_glm52m_grok45_rot.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (46.528) | ok   (0) | ok   (0.990) | ok   (0) | ok   (0) | warn (6697.408) | --   |
| `02_hy3+synth.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (45.335) | ok   (0) | ok   (0.968) | ok   (0) | ok   (0) | warn (31328.938) | --   |
| `02_hy3+synth21.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (45.335) | ok   (0) | ok   (0.968) | ok   (0) | ok   (0) | warn (31328.938) | --   |
| `02_hy3+synth22.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (45.335) | ok   (0) | ok   (0.968) | ok   (0) | ok   (0) | warn (31328.938) | --   |
| `02_qwen38_27b_ornith1_hermes.html` | full | ok   (1.000) | ok   (-1.000) | ok   (-1.000) | ok   (45.891) | ok   (0) | ok   (0.970) | ok   (0) | ok   (0) | warn (20831.531) | --   |

| file | spin coupling | energy during spin |
|---|---|---|
| `0_laguna21.html` | --   | --   |
| `0_qwen36ct.html` | --   | --   |
| `0_qwen36t diz.html` | --   | --   |
| `0_step37f_bug_ball_escape.html` | --   | --   |
| `0_step37f.html` | --   | --   |
| `0-dots3.html` | ok   (1.907) | ok   (6.66e-16) |
| `0-GPT56luna.html` | ok   (2.180) | ok   (2.22e-16) |
| `0!_claude_opus48t.html` | --   | --   |
| `0!_glm52max.html` | --   | --   |
| `01_hy3.html` | ok   (3.413) | --   (0.030) |
| `01_ornith1.html` | ok   (1.466) | --   (0.458) |
| `01_ornith15.html` | --   | --   |
| `01_qwen38_27b_hermes.html` | ok   (1.964) | --   (0.016) |
| `01_qwen38_27b_i4.htm` | ok   (2.355) | --   (0.021) |
| `01-space-bunny-Alpha.html` | ok   (0.791) | warn (3.33e-4) |
| `01-step5prev-1400s.html` | --   | --   |
| `01!_claude48ot_c46_rot.html` | --   | --   |
| `01!_glm52m_grok45_rot.html` | ok   (2.137) | --   (0.001) |
| `02_hy3+synth.html` | ok   (3.413) | --   (0.030) |
| `02_hy3+synth21.html` | ok   (3.413) | --   (0.030) |
| `02_hy3+synth22.html` | ok   (3.413) | --   (0.030) |
| `02_qwen38_27b_ornith1_hermes.html` | ok   (1.964) | --   (0.016) |

