## 1

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

### typical bugs:

square1 problem with wrap-xy

## 2
- checkbox toggles square1 rotation. off: locked rotation, free translation. on: free rotation+translation, moment of inertia computed analytically for shape with hole
