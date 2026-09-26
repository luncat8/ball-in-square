'use strict';
const path = require('path');
const { ADAPTERS } = require('./adapters');

const ALIAS = {
	px: ['x', 'cx', 'bx', 'px', 'xx', 'posx', 'xpos', 'sxx', 'bodyx', 'boxx', 'p1x'],
	py: ['y', 'cy', 'by', 'py', 'yy', 'posy', 'ypos', 'syy', 'bodyy', 'boxy', 'p1y'],
	vx: ['vx', 'cvx', 'bvx', 'velx', 'dx', 'vxx', 'xv', 'velx0'],
	vy: ['vy', 'cvy', 'bvy', 'vely', 'dy', 'vyy', 'yv', 'vely0'],
	bvx: ['bvx', 'vx', 'wx', 'wvx', 'velx', 'cvx', 'dx', 'vxx', 'xv', 'speedx'],
	bvy: ['bvy', 'vy', 'wy', 'wvy', 'vely', 'cvy', 'dy', 'vyy', 'yv', 'speedy'],
	ang: ['a', 'ang', 'angle', 'rot', 'rotation', 'theta', 'th', 'orient', 'heading', 'dir'],
	om: ['w', 'omega', 'wz', 'spin', 'av', 'angvel', 'angularvelocity', 'rotspeed', 'ws'],
	I: ['i', 'ii', 'inertia', 'moment', 'momentofinertia', 'inertia0', 'imo'],
	m: ['m', 'mass'],
	r: ['r', 'rad', 'radius', 'br', 'ballr', 'ballradius'],
	mass: ['mball', 'mb', 'm1', 'massball', 'ballmass'],
	boxmass: ['mbox', 'ms', 'm2', 'massbox', 'boxmass', 'squaremass']
};

const NAME_BALL = /ball|puck|marble|dot|bead/i;
const NAME_BODY = /square|box|frame|body|ring|obj|shell|plate|hole|container|^sq$|^sq[A-Z_0-9]|\bsq\b|\bbody\b/i;

const OBJ_WORDS = ['ball', 'b', 'ball1', 'ballObj', 'ballState', 'puck', 'dot', 'marble', 'sphere',
	'box', 'square', 'square1', 'sq', 'body', 'frame', 'obj', 'object', 'o', 'p', 'state', 'sim',
	'simulation', 'world', 'physics', 'sys', 's', 'q', 'e', 'ent', 'thing', 'hole', 'shell', 'ring'];

const SCALARS = {
	ball: {
		x: ['bx', 'ballX', 'ballx', 'p1x', 'ballPosX'], y: ['by', 'ballY', 'bally', 'p1y', 'ballPosY'],
		vx: ['bvx', 'ballVx', 'ballvx', 'b_vx', 'ballVelX'], vy: ['bvy', 'ballVy', 'ballvy', 'b_vy', 'ballVelY']
	},
	body: {
		x: ['cx', 'sqX', 'sqx', 'squareX', 'squarex', 'ox', 'px', 'frameX'], y: ['cy', 'sqY', 'sqy', 'squareY', 'squarey', 'oy', 'py', 'frameY'],
		vx: ['cvx', 'sqVx', 'sqvx', 'squareVx', 'ox2', 'svx'], vy: ['cvy', 'sqVy', 'sqvy', 'squareVy', 'svy'],
		ang: ['ang', 'angle', 'a', 'rot', 'theta'], om: ['w', 'omega', 'wz', 'spin', 'sqW']
	}
};

const CONST_WORDS = ['I', 'INERTIA', 'inertia', 'MOMENT', 'MASS', 'M', 'BM', 'MBALL', 'BR', 'R', 'RAD',
	'LIM', 'LIMIT', 'HALF_IN', 'HALF_OUT', 'A_IN', 'A_OUT', 'INNER', 'OUTER', 'W', 'H', 'SIZE', 'DT',
	'G', 'GRAV', 'RHO', 'DENSITY'];

function keysOf(o) {
	const out = [];
	try { for (const k of Object.keys(o)) out.push(k); } catch (e) { /* cross-realm proxy */ }
	for (const k in o) if (out.indexOf(k) < 0) out.push(k);
	return out;
}

function matchField(obj, names) {
	for (const k of keysOf(obj)) {
		if (names.indexOf(String(k).toLowerCase()) >= 0) {
			const v = obj[k];
			if (typeof v === 'number' || (v && typeof v.valueOf === 'function')) return { key: k, get: () => Number(obj[k]) };
		}
	}
	return null;
}

function vecField(obj, names) {
	return names ? matchField(obj, names) : null;
}

function alFor(kind, k) {
	if (kind === 'ball' && ALIAS['b' + k]) return ALIAS['b' + k];
	return ALIAS[k];
}

function describe(obj, kind) {
	const f = {};
	for (const k of ['px', 'py', 'vx', 'vy', 'ang', 'om', 'I']) { const m = vecField(obj, alFor(kind, k)); if (m) f[k] = m.key; }
	return f;
}

function scoreBody(f) { return (f.px ? 1 : 0) + (f.py ? 1 : 0) + (f.ang ? 1 : 0) + (f.om ? 1 : 0) + (f.I ? 1 : 0) + (f.vx ? 1 : 0); }
function scoreBall(f) { return (f.px ? 1 : 0) + (f.py ? 1 : 0) + (f.vx ? 1 : 0) + (f.vy ? 1 : 0); }

function evalIn(sb, code) { try { return { ok: true, v: sb.eval(code) }; } catch (e) { return { ok: false }; } }

function scalarReader(sb, words, want) {
	const found = {};
	for (const w of words) {
		const r = evalIn(sb, 'typeof ' + w);
		if (r.ok && r.v === 'number') found[w] = w;
	}
	if (Object.keys(found).length < 2) return null;
	const get = {}, set = {}, used = {};
	for (const slot of Object.keys(want)) {
		for (const w of want[slot]) {
			if (!found[w]) continue;
			const n = w;
			get[slot] = () => { const r = evalIn(sb, n); return r.ok ? r.v : NaN; };
			set[slot] = v => { try { sb.run(n + ' = ' + v); return true; } catch (e) { return false; } };
			used[slot] = n;
			break;
		}
	}
	if (get.x === undefined || get.y === undefined) return null;
	return { kind: 'scalar', get, set, used, words: Object.keys(found) };
}

function objReader(obj, name, kind) {
	const f = describe(obj, kind);
	const g = {};
	for (const k of ['px', 'py', 'vx', 'vy', 'ang', 'om', 'I', 'm', 'r']) { const m = vecField(obj, alFor(kind, k)); if (m) g[k] = m; }
	g.mass = matchField(obj, ALIAS.mass) || matchField(obj, ['mball', 'mb', 'm1']);
	g.boxmass = matchField(obj, ALIAS.boxmass) || matchField(obj, ['mbox', 'ms', 'm2']);
	if (g.mass && !g.m) g.m = g.mass;
	const set = {};
	for (const k of ['px', 'py', 'vx', 'vy', 'ang', 'om']) if (g[k]) { const key = g[k].key; set[k] = v => { obj[key] = v; }; }
	return { kind: 'object', obj, name, fields: f, get: g, set };
}

function read(r, slot, dflt) {
	if (!r) return dflt;
	const f = r.get && r.get[slot];
	if (!f) return dflt;
	const fn = typeof f === 'function' ? f : f.get;
	const v = fn();
	return typeof v === 'number' && isFinite(v) ? v : dflt;
}

function stateOf(p) {
	return {
		ball: { x: read(p.ball, 'px', NaN), y: read(p.ball, 'py', NaN), vx: read(p.ball, 'vx', NaN), vy: read(p.ball, 'vy', NaN) },
		body: {
			x: read(p.body, 'px', NaN), y: read(p.body, 'py', NaN), vx: read(p.body, 'vx', NaN), vy: read(p.body, 'vy', NaN),
			a: read(p.body, 'ang', NaN), w: read(p.body, 'om', NaN), I: read(p.body, 'I', NaN)
		}
	};
}

function probe(sim) {
	const sb = sim.sb;
	const name = path.basename(sim.info.name);
	const p = { level: 'none', ball: null, body: null, const: {}, names: {}, why: '', src: 'heuristic' };

	const adapter = ADAPTERS[name];
	if (adapter) {
		p.src = 'adapter';
		p.conv = adapter.conv || {};
		if (adapter.ball) { const r = evalIn(sb, adapter.ball); if (r.ok && r.v) p.ball = objReader(r.v, adapter.ball); }
		if (adapter.body) { const r = evalIn(sb, adapter.body); if (r.ok && r.v) p.body = objReader(r.v, adapter.body); }
		if (adapter.fields) for (const k of Object.keys(adapter.fields)) p.body = p.body || { get: {} }, p.ball = p.ball || { get: {} }, (p.ball.get[k] = p.ball.get[k] || adapter.fields[k]);
		for (const k of Object.keys(adapter.const || {})) {
			const r = evalIn(sb, adapter.const[k]);
			if (r.ok && typeof r.v === 'number') p.const[k] = r.v;
		}
		p.level = p.ball && p.ball.get.px && p.ball.get.py ? 'object' : 'adapter-partial';
		p.names = { ball: adapter.ball || '(fields)', body: adapter.body || '(fields)' };
		p.ballFields = p.ball ? p.ball.fields || {} : {};
		p.bodyFields = p.body ? p.body.fields || {} : {};
		for (const w of CONST_WORDS) {
			const r = evalIn(sb, 'typeof ' + w + '!=="undefined"?' + w + ':undefined');
			if (r.ok && typeof r.v === 'number' && isFinite(r.v)) p.const[w] = r.v;
		}
		if (p.body) { const st = stateOf(p); if (isFinite(st.body.I) && st.body.I > 0) p.const.I = st.body.I; }
		if (p.level === 'object') return p;
	}

	const cands = [];
	const seen = new Set();
	const push = (obj, nm) => {
		if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
		seen.add(obj);
		cands.push({ obj, name: nm, fNeutral: describe(obj), fBall: describe(obj, 'ball') });
	};
	const gk = evalIn(sb, 'Object.keys(globalThis)');
	if (gk.ok && Array.isArray(gk.v)) for (const k of gk.v) { const r = evalIn(sb, 'globalThis[' + JSON.stringify(k) + ']'); push(r.v, k); }
	for (const w of OBJ_WORDS) { const r = evalIn(sb, 'typeof ' + w + '!=="undefined"?' + w + ':null'); if (r.ok) push(r.v, w); }

	p.candidates = cands.map(c => ({ name: c.name, fields: c.fNeutral }));
	const bodies = [], balls = [];
	for (const c of cands) {
		if (!c.fNeutral.px || !c.fNeutral.py) continue;
		const isNameBody = c.name && NAME_BODY.test(c.name) && !NAME_BALL.test(c.name);
		const isNameBall = c.name && NAME_BALL.test(c.name) && !NAME_BODY.test(c.name);
		if (isNameBall) balls.push({ c, s: scoreBall(c.fBall) + 2, kind: 'ball' });
		else if (isNameBody) bodies.push({ c, s: scoreBody(c.fNeutral) + 2, kind: 'body' });
		else if (c.fNeutral.ang || c.fNeutral.om || c.fNeutral.I) bodies.push({ c, s: scoreBody(c.fNeutral), kind: 'body' });
		else if (c.fNeutral.vx || c.fNeutral.vy) balls.push({ c, s: scoreBall(c.fBall), kind: 'ball' });
		else balls.push({ c, s: scoreBall(c.fBall), kind: 'ball' });
	}
	bodies.sort((x, y) => y.s - x.s);
	balls.sort((x, y) => y.s - x.s);
	if (balls.length > 1) for (let i = 1; i < balls.length; i++) if (!balls[0].c.fBall.vx && balls[i].c.fBall.vx) { balls.unshift(balls.splice(i, 1)[0]); break; }

	if (bodies.length) { p.body = objReader(bodies[0].c.obj, bodies[0].c.name, 'body'); p.names.body = bodies[0].c.name; }
	if (balls.length) { p.ball = objReader(balls[0].c.obj, balls[0].c.name, 'ball'); p.names.ball = balls[0].c.name; }

	if (!p.ball) {
		const sb2 = scalarReader(sb, [].concat(SCALARS.ball.x, SCALARS.ball.y, SCALARS.ball.vx, SCALARS.ball.vy), SCALARS.ball);
		if (sb2) { p.ball = sb2; p.names.ball = 'scalars:' + sb2.words.join(','); p.src = 'scalar'; }
	}
	if (!p.body) {
		const bd = scalarReader(sb, [].concat(SCALARS.body.x, SCALARS.body.y, SCALARS.body.vx, SCALARS.body.vy, SCALARS.body.ang, SCALARS.body.om), SCALARS.body);
		if (bd) { p.body = bd; p.names.body = 'scalars:' + bd.words.join(','); p.src = 'scalar'; }
	}

	for (const w of CONST_WORDS) {
		const r = evalIn(sb, 'typeof ' + w + '!=="undefined"?' + w + ':undefined');
		if (r.ok && typeof r.v === 'number' && isFinite(r.v)) p.const[w] = r.v;
	}
	if (p.body) { const st = stateOf(p); if (isFinite(st.body.I) && st.body.I > 0) p.const.I = st.body.I; }
	if (sim.canvas) {
		p.const.canvasW = sim.canvas.width;
		p.const.canvasH = sim.canvas.height;
	}

	p.level = p.ball && p.ball.get.px ? (p.body && p.body.get.px ? 'full' : 'ball-only') : 'none';
	if (p.level === 'none') p.why = 'no ball-like state found; add an entry to test/lib/adapters.js';
	else if (p.level === 'ball-only') p.why = 'ball state found, no body state; translational checks only';
	p.ballFields = p.ball ? p.ball.fields || {} : {};
	p.bodyFields = p.body ? p.body.fields || {} : {};
	return p;
}

function rebind(p, sb) {
	if (p.src === 'canvas') return p;
	const kinds = [];
	if (p.ball && p.ball.kind === 'object' && p.ball.name) kinds.push(['ball', p.ball.name]);
	if (p.body && p.body.kind === 'object' && p.body.name) kinds.push(['body', p.body.name]);
	for (const slot of kinds) {
		const r = evalIn(sb, 'typeof ' + slot[1] + '!=="undefined"?' + slot[1] + ':null');
		if (!r.ok || !r.v || r.v === p[slot[0]].obj) continue;
		const kind = slot[0] === 'ball' ? 'ball' : 'body';
		p[slot[0]] = objReader(r.v, slot[1], kind);
		p.names[slot[0]] = slot[1];
		p[slot[0] + 'Fields'] = p[slot[0]].fields;
	}
	return p;
}

module.exports = { probe, stateOf, read, rebind, ALIAS };
