'use strict';
const path = require('path');
const { loadSim } = require('./load');
const { probe, stateOf, read, rebind } = require('./probe');
const { makeReader: makeCanvasReader } = require('./canvas');

const FIELD = 1024;
const MB = 1, MS = 1;
const I_REF = 8333.333333333333;
const BALL_R = 5;
const HOLE_HALF = 50;
const LIM_REF = HOLE_HALF - BALL_R;

function chk(list, name, status, value, detail) { list.push({ name, status, value, detail: detail || '' }); }

function minImg(d, size) { const h = size / 2; if (d > h) return d - size; if (d < -h) return d + size; return d; }

function stateReader(p, sb) {
	return {
		refresh() { rebind(p, sb); },
		kind: 'state',
		names: p.names,
		ballSet: p.ball && p.ball.set,
		bodySet: p.body && p.body.set,
		bodyX() { return read(p.body, 'px', NaN); },
		bodyY() { return read(p.body, 'py', NaN); },
		hasVel: !!(p.ball && p.ball.get.vx && p.ball.get.vy),
		hasBodyVel: !!(p.body && p.body.get.vx && p.body.get.vy),
		hasSpin: !!(p.body && p.body.get.om),
		begin() {}, end() {},
		read() { return stateOf(p); }
	};
}

function setCheckbox(sim, on) {
	const doc = sim.sb.document;
	const found = [];
	const scan = (c) => { if (c && c.type === 'checkbox' && found.indexOf(c) < 0) found.push(c); };
	for (const el of Object.values(doc._byId)) scan(el);
	for (const arr of Object.values(doc._bySel || {})) for (const el of arr) scan(el);
	for (const el of doc.body.children) scan(el);
	if (!found.length) return 0;
	for (const el of found) { el.checked = !!on; sim.sb.fire(el, { type: 'input', target: el }); sim.sb.fire(el, { type: 'change', target: el }); }
	return found.length;
}

function pressKey(sim, key, code) {
	const c = code || ('Key' + String(key).toUpperCase());
	sim.sb.fire(sim.sb.sandbox, { type: 'keydown', key, code: c });
	sim.sb.fire(sim.sb.sandbox, { type: 'keyup', key, code: c });
}

function clickByName(sim, re) {
	const doc = sim.sb.document;
	for (const el of Object.values(doc._byId)) {
		const hay = (el.id + ' ' + (el.textContent || '') + ' ' + ((el._attrs && el._attrs.name) || '')).toLowerCase();
		if (re.test(hay)) { sim.sb.fire(el, { type: 'click', target: el }); return el.id; }
	}
	return null;
}

function tryReset(sim) {
	pressKey(sim, 'r');
	const b = clickByName(sim, /reset|restart|new game/);
	return b ? 'button:' + b : 'key:r';
}

function placeBall(reader, convLocal, ox, oy) {
	const bs = reader.ballSet;
	if (!bs || !bs.px) return false;
	if (convLocal) { bs.px(ox); bs.py(oy); return true; }
	const bx = reader.bodyX(), by = reader.bodyY();
	if (!isFinite(bx) || !isFinite(by)) return false;
	bs.px(bx + ox); bs.py(by + oy);
	return true;
}

function kickBall(sim, p, reader, speed, convLocal) {
	if (reader.ballSet && reader.ballSet.vx) {
		placeBall(reader, convLocal, 0, 0);
		reader.ballSet.vx(Math.cos(0.7) * speed);
		reader.ballSet.vy(Math.sin(0.7) * speed);
		return 'state';
	}
	const id = clickByName(sim, /kick|shoot|launch|drop|start/);
	if (id) return 'button:' + id;
	pressKey(sim, ' ', 'Space');
	return 'key:space';
}

function decideConvention(sim, p, reader, seconds) {
	const fps = 60;
	let world = 0, local = 0, n = 0;
	for (let i = 0; i < Math.round(seconds * fps); i++) {
		sim.step(1 / fps);
		const st = reader.read();
		if (!st) continue;
		if (![st.ball.x, st.ball.y, st.body.x, st.body.y].every(v => typeof v === 'number' && isFinite(v))) continue;
		world = Math.max(world, Math.abs(st.ball.x - st.body.x), Math.abs(st.ball.y - st.body.y));
		local = Math.max(local, Math.abs(st.ball.x), Math.abs(st.ball.y));
		n++;
	}
	if (reader.kind === 'canvas') return { local: false, world, localMax: local, n, conf: 'canvas' };
	if (n < 4) return { local: false, world, localMax: local, n, conf: 'low' };
	return { local: local < world, world, localMax: local, n, conf: local < world * 0.5 ? 'high' : (local < world ? 'mid' : 'high') };
}

function battery(file, opts) {
	const o = opts || {};
	const seconds = o.seconds || 12;
	const fps = o.fps || 60;
	const dt = 1 / fps;
	const sim = loadSim(file, { fps, seed: o.seed === undefined ? 12345 : o.seed, warmup: 0.35 });
	const sb = sim.sb;
	const out = { file: path.basename(file), rotate: !!o.rotate, checks: [], level: 'none' };
	if (sim.info.loadError) { chk(out.checks, 'loads', 'fail', null, sim.info.loadError); out.level = 'load-fail'; return out; }
	chk(out.checks, 'loads', 'pass', sim.scripts || sim.info.scripts, 'inline script evaluated in vm');

	const p = probe(sim);
	out.probe = { level: p.level, src: p.src, ball: p.names.ball, body: p.names.body, why: p.why };
	out.checkbox = o.rotate === undefined ? 0 : setCheckbox(sim, o.rotate);
	sim.step(0.3);
	if (p.const.I) out.I = p.const.I;

	const conv = { local: false };
	let convLocal = false, convVel = null;
	const reader = p.level !== 'none' ? stateReader(p, sb) : makeCanvasReader(sim, sim.canvas ? sim.canvas.width : FIELD);
	out.src = reader.kind;
	out.sample = { reset: tryReset(sim) };
	sim.step(0.25);
	reader.refresh();
	const convRes = decideConvention(sim, p, reader, 0.45);
	convLocal = convRes.local;
	out.sample.conv = convRes.local ? 'ball-local' : 'ball-world';
	out.sample.convConf = convRes.conf;
	out.sample.kick = kickBall(sim, p, reader, o.speed || 620, convRes.local);
	reader.refresh();

	const I = p.const.I || 0;
	const mb = p.const.BM || p.const.MBALL || MB;
	const ms = p.const.MASS || p.const.MS || MS;
	const nFrames = Math.round(seconds * fps);
	reader.begin();
	let firstErr = -1, nonFinite = -1, noState = 0, ema = null;
	const recs = [];
	for (let f = 0; f < nFrames; f++) {
		sim.step(dt);
		if (f % 30 === 0) reader.refresh();
		if (sim.sb.log.errors.length && firstErr < 0) firstErr = f;
		const st = reader.read();
		if (!st) { noState++; continue; }
		const needBody = reader.kind === 'canvas' || !!p.body;
		const fields = needBody ? [st.ball.x, st.ball.y, st.body.x, st.body.y] : [st.ball.x, st.ball.y, st.ball.vx, st.ball.vy];
		if (!fields.every(v => typeof v === 'number' && isFinite(v))) { if (nonFinite < 0) nonFinite = f; continue; }
		if (f < fps * 0.3) continue;
		recs.push({ bx: st.ball.x, by: st.ball.y, bvx: st.ball.vx, bvy: st.ball.vy, sx: st.body.x, sy: st.body.y, svx: st.body.vx, svy: st.body.vy, a: st.body.a, w: st.body.w });
		if (recs.length > 6000) break;
	}
	reader.end();

	const rawLocal = recs.map(r => [r.bx, r.by]);
	const rawWorld = recs.map(r => [minImg(r.bx - r.sx, FIELD), minImg(r.by - r.sy, FIELD)]);
	const pick = convLocal ? rawLocal : rawWorld;
	const med = arr => { const v = arr.slice().sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 0; };
	const dx = med(pick.map(p => p[0])), dy = med(pick.map(p => p[1]));
	const rangeX = Math.max(...pick.map(p => p[0])) - Math.min(...pick.map(p => p[0]));
	const rangeY = Math.max(...pick.map(p => p[1])) - Math.min(...pick.map(p => p[1]));
	const calibrated = Math.min(rangeX, rangeY) > 0.5 * (2 * LIM_REF);
	const off = pick.map(p => [p[0] - (calibrated ? dx : 0), p[1] - (calibrated ? dy : 0)]);
	out.calib = { dx, dy, rangeX: +rangeX.toFixed(2), rangeY: +rangeY.toFixed(2), applied: calibrated };

	const combos = [];
	for (const rel of [true, false]) for (const rot of [false, true]) combos.push({ rel, rot, ke0: null, keMax: 0, p0: null, pMax: 0, l0: null, lMax: 0, n: 0, sumU: 0 });
	let offMax = 0, jumpMax = 0, pathLen = 0, s0 = 0, wMax = 0, nearFrames = 0;
	let prev = null;
	for (let i = 0; i < recs.length; i++) {
		const r = recs[i], o = off[i];
		const box = Math.max(Math.abs(o[0]), Math.abs(o[1]));
		offMax = Math.max(offMax, box);
		if (prev) {
			const step = Math.hypot(minImg(o[0] - prev.o[0], FIELD), minImg(o[1] - prev.o[1], FIELD));
			pathLen += step;
			ema = ema === null ? step : ema * 0.9 + step * 0.1;
			if (step > Math.max(18, 2.5 * ema + 4)) jumpMax = Math.max(jumpMax, step);
		}
		prev = { o };
		const a = isFinite(r.a) ? r.a : 0, w = isFinite(r.w) ? r.w : 0;
		const svx = isFinite(r.svx) ? r.svx : 0, svy = isFinite(r.svy) ? r.svy : 0;
		wMax = Math.max(wMax, Math.abs(w));
		const nearWall = reader.kind === 'canvas' && box > 0.97 * LIM_REF;
		if (nearWall) nearFrames++;
		const ca = Math.cos(-a), sa = Math.sin(-a);
		for (const cmb of combos) {
			let bx2 = r.bvx, by2 = r.bvy;
			if (!isFinite(bx2) || !isFinite(by2)) { cmb.skip = true; continue; }
			if (cmb.rot) { const tx = ca * bx2 - sa * by2; by2 = sa * bx2 + ca * by2; bx2 = tx; }
			const vbx = cmb.rel ? svx + bx2 : bx2, vby = cmb.rel ? svy + by2 : by2;
			const ux = cmb.rel ? bx2 : bx2 - svx, uy = cmb.rel ? by2 : by2 - svy;
			const su = Math.hypot(ux, uy);
			cmb.sumU += su * dt;
			if (!s0 && su > 1) s0 = su;
			const Px = ms * svx + mb * vbx, Py = ms * svy + mb * vby;
			if (cmb.p0 === null) cmb.p0 = { x: Px, y: Py };
			cmb.pMax = Math.max(cmb.pMax, Math.hypot(Px - cmb.p0.x, Py - cmb.p0.y));
			if (!o.rotate) {
				const L = I * w + 0.5 * (o[0] * uy - o[1] * ux);
				if (cmb.l0 === null) cmb.l0 = L;
				cmb.lMax = Math.max(cmb.lMax, Math.abs(L - cmb.l0));
			}
			if (nearWall) continue;
			const ke = 0.5 * mb * (vbx * vbx + vby * vby) + 0.5 * ms * (svx * svx + svy * svy) + 0.5 * I * w * w;
			if (ke > 0) {
				cmb.n++;
				if (cmb.ke0 === null) cmb.ke0 = ke;
				cmb.keMax = Math.max(cmb.keMax, Math.abs(ke / cmb.ke0 - 1));
			}
		}
	}
	const live = combos.filter(c => c.ke0 !== null);
	const best = live.length ? live.reduce((x, y) => (y.keMax < x.keMax ? y : x)) : null;

	chk(out.checks, 'runs without error', firstErr < 0 && sim.sb.log.errors.length === 0 ? 'pass' : 'fail', firstErr,
		sim.sb.log.errors.slice(0, 2).map(e => e.where + ': ' + e.msg).join(' | '));
	chk(out.checks, 'state stays finite', nonFinite < 0 ? 'pass' : 'fail', nonFinite, nonFinite >= 0 ? 'non-finite at frame ' + nonFinite : '');
	const hasBody = !!(reader.kind === 'canvas' || p.body);
	const over = offMax - LIM_REF;
	const cStatus = !hasBody ? 'skip' : over <= 2 ? 'pass' : over <= 10 ? 'warn' : 'fail';
	chk(out.checks, 'ball contained in hole1', cStatus, offMax,
		!hasBody ? 'no body state to measure the offset against'
			: 'max max(|dx|,|dy|) ' + offMax.toFixed(3) + ' px vs limit ' + LIM_REF + ' (overshoot ' + over.toFixed(2) + ' px)'
			+ (calibrated ? ', centre calibrated by median, ball range ' + out.calib.rangeX.toFixed(0) + 'x' + out.calib.rangeY.toFixed(0) : ', raw (range too small to calibrate)'));
	chk(out.checks, 'no position teleport', !hasBody ? 'skip' : jumpMax === 0 ? 'pass' : 'fail', jumpMax,
		!hasBody ? 'no body state for a relative offset' : jumpMax ? 'offset jump ' + jumpMax.toFixed(1) + ' px' : '');

	let fid = null;
	for (const cmb of combos) if (cmb.sumU > 0) { const f2 = pathLen / cmb.sumU; if (fid === null || Math.abs(f2 - 1) < Math.abs(fid - 1)) fid = f2; }
	const fidelity = fid === null ? NaN : fid;
	out.fidelityByCombo = combos.map(c => (c.rel ? 'rel/' : 'abs/') + (c.rot ? 'rot' : 'world') + '=' + (c.sumU > 0 ? (pathLen / c.sumU).toFixed(3) : 'n/a')).join(' ');
	if (o.rotate) {
		chk(out.checks, 'time fidelity (rot on)', isFinite(fidelity) ? 'warn' : 'skip', fidelity, 'path/speed ratio ' + (isFinite(fidelity) ? fidelity.toFixed(3) : 'n/a') + ' — informational while the body spins');
	} else {
		chk(out.checks, 'time fidelity', !isFinite(fidelity) ? 'skip' : Math.abs(fidelity - 1) < 0.15 ? 'pass' : 'fail', fidelity,
			isFinite(fidelity) ? 'expected 1.000, got ' + fidelity.toFixed(3) + (Math.abs(fidelity - 1) >= 0.15 ? ' — sim clock does not track wall clock' : '') : 'no velocity signal');
	}

	convVel = best ? (best.rel ? 'relative' : 'absolute') + '/' + (best.rot ? 'rotated' : 'world') : null;
	if (best && best.keMax < 0.02) {
		const d = best.keMax;
		chk(out.checks, 'kinetic energy', d < 1e-6 ? 'pass' : 'warn', d,
			'max |dKE|/KE ' + d.toExponential(2) + ' [' + convVel + ' reading, ' + best.n + ' free-flight frames; next best ' + live.filter(c => c !== best).reduce((m, c) => Math.min(m, c.keMax), 9).toExponential(2) + ']');
	} else {
		chk(out.checks, 'kinetic energy', reader.kind === 'canvas' ? 'warn' : 'fail', best ? best.keMax : null,
			'no velocity convention reproduces a constant total energy — ' + combos.map(c => (c.rel ? 'rel/' : 'abs/') + (c.rot ? 'rot' : 'world') + '=' + (c.ke0 === null ? 'n/a' : c.keMax.toFixed(3))).join(' ')
			+ (reader.kind === 'canvas' ? ' (velocities from finite differences of the rendered path)' : ''));
	}
	if (best && best.p0) {
		chk(out.checks, 'linear momentum', best.pMax < 1e-6 ? 'pass' : best.pMax < 0.02 * Math.max(1, Math.hypot(best.p0.x, best.p0.y)) ? 'warn' : 'fail', best.pMax, 'max |dP| ' + best.pMax.toExponential(2) + ' px*m/s');
		if (!o.rotate) chk(out.checks, 'angular momentum (COM)', best.lMax < 1e-3 * Math.max(1, Math.abs(best.l0)) ? 'pass' : 'warn', best.lMax, 'max |dL| ' + best.lMax.toExponential(2) + (best.lMax > 1e-3 ? ' — expected only at asymmetric corner contacts' : ''));
	} else {
		chk(out.checks, 'linear momentum', 'skip', null, 'body velocity not available');
	}
	if (I) {
		const relI = Math.abs(I - I_REF) / I_REF;
		chk(out.checks, 'analytic inertia', relI < 0.01 ? 'pass' : 'fail', I, 'I=' + I.toFixed(2) + ' vs ' + I_REF.toFixed(2) + ' (rel ' + (relI * 100).toFixed(2) + '%)');
	} else {
		chk(out.checks, 'analytic inertia', 'skip', null, 'I not exposed');
	}
	out.metrics = { offMax, jumpMax, fidelity, driftKE: best ? best.keMax : null, convVel, convLocal, dP: best ? best.pMax : null, dL: best ? best.lMax : null, omegaMax: wMax, I, s0, noState, frames: recs.length, nearFrames };
	out.level = reader.kind === 'canvas' ? 'canvas' : 'state';
	return out;
}

function spinProbe(file, opts) {
	const o = opts || {};
	const sim = loadSim(file, { fps: 60, seed: 7, warmup: 0.35 });
	const p = probe(sim);
	const out = { file: path.basename(file), checks: [], src: p.level };
	if (sim.info.loadError) { chk(out.checks, 'spin coupling', 'skip', null, 'load failed'); return out; }
	if (p.level === 'none') { chk(out.checks, 'spin coupling', 'skip', null, 'state is closure-private; probe the rendered trajectory instead'); return out; }
	setCheckbox(sim, true);
	sim.step(0.3);
	const rd = stateReader(p, sim.sb);
	const conv = decideConvention(sim, p, rd, 0.35);
	rd.refresh();
	const bs = p.ball && p.ball.set, bod = p.body && p.body.set;
	if (!bs || !bs.px || !bs.vx || !p.body || !p.body.get.om) { chk(out.checks, 'spin coupling', 'skip', null, 'no writable ball position or omega in state'); return out; }
	if (bod && bod.om) bod.om(0);
	if (bod && bod.vx) { bod.vx(0); bod.vy(0); }
	if (conv.local) { bs.px(0); bs.py(0.45 * LIM_REF); }
	else { bs.px(rd.bodyX() + 0.45 * LIM_REF); bs.py(rd.bodyY()); }
	bs.vx(0); bs.vy(700);
	const keOf = rel => {
		const st = stateOf(p);
		const I = p.const.I || 0;
		const bx = st.ball.vx, by = st.ball.vy;
		const vx = rel ? st.body.vx + bx : bx, vy = rel ? st.body.vy + by : by;
		return 0.5 * (vx * vx + vy * vy) + 0.5 * (st.body.vx ** 2 + st.body.vy ** 2) + 0.5 * I * (st.body.w || 0) ** 2;
	};
	const ke0 = Math.min(keOf(true), keOf(false));
	let w = 0;
	for (let i = 0; i < 120; i++) { sim.step(1 / 60); const st = stateOf(p); w = Math.max(w, Math.abs(st.body.w || 0)); }
	const dKE = ke0 > 0 ? Math.abs(Math.min(keOf(true), keOf(false)) / ke0 - 1) : NaN;
	chk(out.checks, 'spin coupling', w > 1e-4 ? 'pass' : 'fail', w, 'max |omega| after an off-centre wall hit = ' + w.toExponential(3) + ' rad/s');
	chk(out.checks, 'energy during spin', !p.const.I ? 'skip' : isFinite(dKE) ? (dKE < 1e-6 ? 'pass' : dKE < 0.02 ? 'warn' : 'fail') : 'skip', dKE,
		!p.const.I ? 'I not exposed, rotational term cannot be included' : isFinite(dKE) ? '|dKE|/KE ' + dKE.toExponential(2) : 'n/a');
	out.metrics = { omegaMax: w, dKE, conv: conv.local ? 'local' : 'world' };
	return out;
}

module.exports = { battery, spinProbe, setCheckbox, probe, loadSim, I_REF, LIM_REF, FIELD };
