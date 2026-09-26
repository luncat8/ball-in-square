'use strict';

const HOLE_HALF = 50;
const BODY_EDGE = 200;
const FIELD = 1024;

function unwrap(v, prev, size) {
	if (prev === null || prev === undefined || !isFinite(prev)) return v;
	let d = v - prev;
	const h = size / 2;
	if (d > h) d -= size;
	if (d < -h) d += size;
	return prev + d;
}

function unwrapDelta(a, b, size) {
	let d = a - b;
	const h = size / 2;
	if (d > h) d -= size;
	if (d < -h) d += size;
	return d;
}

function extract(sink, size, prev) {
	const ops = sink.ops;
	if (!ops || !ops.length) return null;
	let rMax = 0;
	for (const o of ops) if (o[0] === 'arc' && o[3] > rMax) rMax = o[3];
	const rBall = rMax * 0.9;

	const cands = [];
	for (const o of ops) {
		if (o[0] !== 'rect') continue;
		const [, cx, cy, w, h, rot, depth] = o;
		if (!isFinite(cx) || !isFinite(cy) || !isFinite(w) || !isFinite(h)) continue;
		if (Math.abs(Math.max(w, h) - BODY_EDGE) > 3) continue;
		let x = prev && isFinite(prev.bx) ? unwrap(cx, prev.bx, size) : cx;
		let y = prev && isFinite(prev.by) ? unwrap(cy, prev.by, size) : cy;
		const d = prev && isFinite(prev.bx) ? Math.hypot(x - prev.bx, y - prev.by) : Math.hypot(cx - size / 2, cy - size / 2);
		cands.push({ x, y, w, h, rot, depth, d, full: Math.abs(w - BODY_EDGE) < 3 && Math.abs(h - BODY_EDGE) < 3 });
	}
	let body = null;
	const full = cands.filter(c => c.full).sort((a, b) => a.d - b.d);
	if (full.length) body = { x: full[0].x, y: full[0].y, a: isFinite(full[0].rot) ? full[0].rot : 0 };
	else if (cands.length) {
		const uniq = [];
		for (const c of cands) {
			let seen = false;
			for (const u of uniq) if (Math.hypot(c.x - u.x, c.y - u.y) < 4) { seen = true; break; }
			if (!seen) uniq.push(c);
		}
		if (uniq.length) body = { x: uniq.reduce((t, c) => t + c.x, 0) / uniq.length, y: uniq.reduce((t, c) => t + c.y, 0) / uniq.length, a: 0 };
	}
	if (!body) {
		for (const o of ops) {
			if (o[0] !== 'translate' && o[0] !== 'setTransform') continue;
			const x = o[0] === 'translate' ? o[1] : o[5];
			const y = o[0] === 'translate' ? o[2] : o[6];
			if (!isFinite(x) || !isFinite(y) || x < 0 || x >= size || y < 0 || y >= size) continue;
			let a = 0;
			for (let k = ops.indexOf(o) + 1; k < ops.length; k++) {
				if (ops[k][0] === 'rotate' && isFinite(ops[k][1])) { a += ops[k][1]; }
				if (ops[k][0] === 'arc' && ops[k][3] >= rBall) break;
			}
			const d = Math.abs(x - size / 2) + Math.abs(y - size / 2);
			if (d < bestB) { bestB = d; body = { x, y, a }; }
		}
	}

	let ball = null, bestA = Infinity;
	for (const o of ops) {
		if (o[0] !== 'arc' || o[3] < rBall) continue;
		for (let ix = -1; ix <= 1; ix++) {
			for (let iy = -1; iy <= 1; iy++) {
				const cx = o[1] + ix * size, cy = o[2] + iy * size;
				const x = prev && isFinite(prev.bx) ? unwrap(cx, prev.bx, size) : cx;
				const y = prev && isFinite(prev.by) ? unwrap(cy, prev.by, size) : cy;
				const d = prev && isFinite(prev.bx) ? Math.hypot(x - prev.bx, y - prev.by) : Math.hypot(cx - size / 2, cy - size / 2);
				if (d < bestA) { bestA = d; ball = { x, y, r: o[3] }; }
			}
		}
	}
	if (!ball) return null;
	return { ball, body };
}

function makeReader(sim, size) {
	const S = size || FIELD;
	const sink = sim.sb.sink;
	const dt = 1 / 60;
	let prev = null, prevBody = null;
	return {
		kind: 'canvas',
		names: { ball: 'ctx.arc', body: 'ctx.rect 200x200' },
		refresh() {},
		begin() { sim.sb.recordOps(true); prev = null; prevBody = null; },
		end() { sim.sb.recordOps(false); sim.sb.resetSink(); },
		read() {
			const s = extract(sink, S, prev);
			sim.sb.resetSink();
			if (!s) return null;
			const out = {
				ball: { x: s.ball.x, y: s.ball.y, vx: NaN, vy: NaN },
				body: { x: NaN, y: NaN, vx: NaN, vy: NaN, a: NaN, w: NaN, I: NaN }
			};
			if (s.body) {
				out.body.x = s.body.x; out.body.y = s.body.y; out.body.a = s.body.a;
				if (prevBody) {
					out.body.vx = unwrapDelta(s.body.x, prevBody.x, S) / dt;
					out.body.vy = unwrapDelta(s.body.y, prevBody.y, S) / dt;
					let da = s.body.a - prevBody.a;
					while (da > Math.PI / 2) da -= Math.PI;
					while (da < -Math.PI / 2) da += Math.PI;
					out.body.w = da / dt;
				}
			}
			if (prev && isFinite(prev.bx)) {
				out.ball.vx = (s.ball.x - prev.bx) / dt;
				out.ball.vy = (s.ball.y - prev.by) / dt;
			}
			prev = { bx: s.ball.x, by: s.ball.y };
			prevBody = s.body ? { x: s.body.x, y: s.body.y, a: s.body.a } : null;
			return out;
		}
	};
}

module.exports = { makeReader, extract, unwrap, unwrapDelta, HOLE_HALF };
