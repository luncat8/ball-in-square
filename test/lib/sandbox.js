'use strict';
const vm = require('vm');

function mulberry32(seed) {
	let a = seed >>> 0;
	return function () {
		a = (a + 0x6D2B79F5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function makeStyle() {
	return new Proxy({}, {
		get: (t, k) => (k in t ? t[k] : ''),
		set: (t, k, v) => { t[k] = v; return true; }
	});
}

function noopProxy(name) {
	const target = function () {};
	return new Proxy(target, {
		get(t, k) {
			if (k === Symbol.toPrimitive || k === 'toString') return () => name;
			if (k === 'then' || k === 'catch' || k === 'finally') return undefined;
			if (!(k in t)) t[k] = noopProxy(name + '.' + String(k));
			return t[k];
		},
		apply() { return noopProxy(name + '()'); },
		construct() { return noopProxy('new ' + name); }
	});
}

function makeCtx2d(sink) {
	const M = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
	const stack = [];
	const depth = { d: 0 };
	const rot = { a: 0, stack: [] };
	const num = (v, dflt) => (typeof v === 'number' && isFinite(v) ? v : dflt);
	const op = (...a) => { if (sink.ops) sink.ops.push(a); };
	const xf = (x, y) => [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f];
	const rec = {
		save() { if (sink.ops) { op('save'); rot.stack.push(rot.a); rot.a = 0; depth.d++; } stack.push({ ...M }); },
		restore() { if (sink.ops) { op('restore'); rot.a = rot.stack.length ? rot.stack.pop() : 0; depth.d = Math.max(0, depth.d - 1); } const p = stack.pop(); if (p) Object.assign(M, p); },
		translate(x, y) { x = num(x); y = num(y); M.e += M.a * x + M.c * y; M.f += M.b * x + M.d * y; op('translate', x, y, depth.d); },
		scale(x, y) { x = num(x, 1); y = num(y, 1); M.a *= x; M.b *= x; M.c *= y; M.d *= y; },
		rotate(a) { a = num(a); op('rotate', a, depth.d); rot.a += a; const c = Math.cos(a), s = Math.sin(a); const a0 = M.a, b0 = M.b, c0 = M.c, d0 = M.d; M.a = a0 * c + c0 * s; M.b = b0 * c + d0 * s; M.c = a0 * -s + c0 * c; M.d = b0 * -s + d0 * c; },
		transform(a, b, c, d, e, f) { a = num(a, 1); b = num(b); c = num(c); d = num(d, 1); e = num(e); f = num(f); const a0 = M.a, b0 = M.b, c0 = M.c, d0 = M.d; M.a = a0 * a + c0 * b; M.b = b0 * a + d0 * b; M.c = a0 * c + c0 * d; M.d = b0 * c + d0 * d; M.e = a0 * e + c0 * f + M.e; M.f = b0 * e + d0 * f + M.f; },
		setTransform(a, b, c, d, e, f) { a = num(a, 1); b = num(b); c = num(c); d = num(d, 1); e = num(e); f = num(f); M.a = a; M.b = b; M.c = c; M.d = d; M.e = e; M.f = f; op('setTransform', a, b, c, d, e, f, depth.d); },
		arc(x, y, r) { x = num(x); y = num(y); r = num(r, -1); if (r <= 0 || !isFinite(r)) return; const p = xf(x, y); sink.arcs.push(p[0], p[1], r); op('arc', p[0], p[1], r, depth.d); },
		ellipse(x, y, rx, ry) { if (num(rx, 0) > 0) rec.arc(x, y, Math.max(rx, ry)); },
		rect(x, y, w, h) { x = num(x); y = num(y); w = num(w); h = num(h); const p = xf(x + w / 2, y + h / 2); sink.rects.push([p[0], p[1], w, h]); op('rect', p[0], p[1], w, h, rot.a, depth.d); },
		fillRect(x, y, w, h) { x = num(x); y = num(y); w = num(w); h = num(h); if (h >= 1) { const p = xf(x + w / 2, y + h / 2); op('rect', p[0], p[1], w, h, rot.a, depth.d); } },
		strokeRect(x, y, w, h) { rec.fillRect(x, y, w, h); },
		clearRect() {},
		measureText(t) { return { width: String(t).length * 7 }; },
		createLinearGradient() { return { addColorStop() {} }; },
		createRadialGradient() { return { addColorStop() {} }; },
		createPattern() { return null; },
		getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
	};
	const base = {};
	for (const k in rec) base[k] = rec[k];
	for (const k of ['beginPath', 'closePath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arcTo', 'fill', 'stroke', 'clip', 'fillText', 'strokeText', 'setLineDash', 'drawImage', 'putImageData', 'resetTransform', 'roundRect', 'reset'])
		base[k] = function () {};
	base.canvas = null;
	return new Proxy(base, {
		get(t, k) {
			if (k in t) return t[k];
			return noopProxy('ctx.' + String(k));
		},
		set(t, k, v) { t[k] = v; return true; }
	});
}

function makeElement(tag, doc) {
	const el = {
		tagName: String(tag).toUpperCase(),
		nodeName: String(tag).toUpperCase(),
		id: '',
		className: '',
		type: '',
		value: '',
		checked: false,
		disabled: false,
		selected: false,
		indeterminate: false,
		name: '',
		title: '',
		alt: '',
		href: '',
		innerHTML: '',
		outerHTML: '',
		textContent: '',
		width: 300,
		height: 150,
		offsetWidth: 300,
		offsetHeight: 150,
		clientWidth: 300,
		clientHeight: 150,
		scrollWidth: 300,
		scrollHeight: 150,
		scrollTop: 0,
		scrollLeft: 0,
		dataset: {},
		style: makeStyle(),
		children: [],
		childNodes: [],
		parentNode: null,
		parentElement: null,
		firstChild: null,
		lastChild: null,
		nextSibling: null,
		previousSibling: null,
		ownerDocument: doc,
		classList: {
			add() {}, remove() {}, toggle() {}, contains() { return false; }, replace() {}
		},
		getContext(kind) { return kind === '2d' ? this._ctx : (kind ? noopProxy('ctx3d') : null); },
		getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: this.width, bottom: this.height, width: this.width, height: this.height, toJSON() { return {}; } }; },
		addEventListener(type, fn) { (this._h[type] || (this._h[type] = [])).push(fn); },
		removeEventListener(type, fn) { const a = this._h[type]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
		dispatchEvent(ev) { return doc._fire(this, ev); },
		setAttribute(k, v) { this[k] = v; this._attrs[k] = String(v); },
		getAttribute(k) { return k in this._attrs ? this._attrs[k] : (this[k] === undefined ? null : this[k]); },
		hasAttribute(k) { return k in this._attrs; },
		removeAttribute(k) { delete this._attrs[k]; },
		appendChild(c) { this.children.push(c); this.childNodes.push(c); c.parentNode = this; return c; },
		removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
		insertBefore(c) { return this.appendChild(c); },
		replaceChild(c) { return this.appendChild(c); },
		cloneNode() { return makeElement(tag, doc); },
		querySelector(sel) { return doc.querySelector(sel); },
		querySelectorAll(sel) { return doc.querySelectorAll(sel); },
		closest() { return null; },
		matches() { return false; },
		contains() { return false; },
		focus() {}, blur() {}, click() { doc._fire(this, { type: 'click', target: this }); },
		toDataURL() { return 'data:,'; },
		requestPointerLock() {}, exitPointerLock() {},
		attachShadow() { return makeElement('shadow', doc); },
		animate() { return { finished: Promise.resolve(), cancel() {}, finish() {} }; }
	};
	el._h = {};
	el._attrs = {};
	el._ctx = makeCtx2d(doc._sink);
	el._ctx.canvas = el;
	return el;
}

function createSandbox(opts) {
	const o = opts || {};
	const sink = { arcs: [], rects: [], ops: null };
	const clock = { t: 0 };
	const raf = [];
	const timers = [];
	let seq = 0;
	const log = { errors: [], warns: [] };

	const doc = {
		_nodeName: '#document',
		hidden: false,
		visibilityState: 'visible',
		readyState: 'complete',
		_sink: sink,
		_h: {},
		_byId: {},
		_bySel: {},
		getElementById(id) {
			id = String(id);
			if (!this._byId[id]) {
				const e = makeElement('div', this);
				e.id = id;
				this._byId[id] = e;
				if (this.body) this.body.appendChild(e);
			}
			return this._byId[id];
		},
		querySelector(sel) { return this.querySelectorAll(sel)[0]; },
		querySelectorAll(sel) {
			sel = String(sel);
			if (!this._bySel[sel]) {
				const out = [];
				for (const m of sel.matchAll(/([#.])([\w-]+)/g)) {
					const e = this.getElementById(m[1] === '#' ? m[2] : 'q.' + m[2]);
					if (m[1] === '.') e.className = (e.className ? e.className + ' ' : '') + m[2];
					if (out.indexOf(e) < 0) out.push(e);
				}
				if (!out.length) out.push(this.getElementById('q.' + sel));
				this._bySel[sel] = out;
			}
			return this._bySel[sel];
		},
		createElement(tag) { return makeElement(tag, this); },
		createElementNS(ns, tag) { return makeElement(tag, this); },
		createTextNode(t) { return { nodeType: 3, textContent: String(t) }; },
		createEvent() { return { initEvent() {} }; },
		addEventListener(type, fn) { (this._h[type] || (this._h[type] = [])).push(fn); },
		removeEventListener(type, fn) { const a = this._h[type]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
		_fire(target, ev) {
			ev = ev || {};
			if (typeof ev === 'string') ev = { type: ev };
			ev.target = ev.target || target;
			ev.currentTarget = target;
			ev.preventDefault = ev.preventDefault || function () { ev.defaultPrevented = true; };
			ev.stopPropagation = ev.stopPropagation || function () {};
			ev.defaultPrevented = false;
			let n = 0;
			for (const el of [target, this, this.defaultView]) {
				if (!el || !el._h) continue;
				for (const fn of (el._h[ev.type] || []).slice()) { n++; try { fn.call(el, ev); } catch (e) { log.errors.push({ where: 'handler:' + ev.type, msg: String(e && e.message || e) }); } }
			}
			return !ev.defaultPrevented;
		},
		elementFromPoint() { return this.body; },
		hasFocus() { return true; },
		fonts: { ready: Promise.resolve(), check: () => Promise.resolve(true), addEventLoader() {} },
		getElementByIdOrThrow(id) { return this.getElementById(id); }
	};
	doc.body = makeElement('body', doc);
	doc.documentElement = makeElement('html', doc);
	doc.head = makeElement('head', doc);
	doc.defaultView = null;

	const store = () => {
		const m = new Map();
		return { getItem: k => (m.has(String(k)) ? m.get(String(k)) : null), setItem: (k, v) => m.set(String(k), String(v)), removeItem: k => m.delete(String(k)), clear: () => m.clear(), key: () => null, get length() { return m.size; } };
	};

	const sandbox = {
		console: {
			log: (...a) => log.warns.push('log ' + a.map(String).join(' ')),
			warn: (...a) => log.warns.push('warn ' + a.map(String).join(' ')),
			error: (...a) => log.warns.push('error ' + a.map(String).join(' ')),
			info() {}, debug() {}, trace() {}, dir() {}, table() {}, group() {}, groupEnd() {}, time() {}, timeEnd() {}, assert() {}, count() {}
		},
		document: doc,
		navigator: { userAgent: 'harness', maxTouchPoints: 0, language: 'en', platform: 'linux', hardwareConcurrency: 4, clipboard: {} },
		location: { href: 'file:///sim.html', protocol: 'file:', host: '', pathname: '/sim.html', search: '', hash: '' },
		screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040 },
		history: { length: 1, pushState() {}, replaceState() {} },
		localStorage: store(),
		sessionStorage: store(),
		performance: { now: () => clock.t, timeOrigin: 0 },
		requestAnimationFrame(cb) { raf.push({ id: ++seq, cb }); return seq; },
		cancelAnimationFrame(id) { const i = raf.findIndex(r => r.id === id); if (i >= 0) raf.splice(i, 1); },
		setTimeout(fn, ms) { timers.push({ id: ++seq, fn, at: clock.t + (ms || 0), every: null }); return seq; },
		setInterval(fn, ms) { timers.push({ id: ++seq, fn, at: clock.t + (ms || 0), every: ms || 16 }); return seq; },
		clearTimeout(id) { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
		clearInterval(id) { this.clearTimeout(id); },
		queueMicrotask(fn) { try { fn(); } catch (e) { log.errors.push({ where: 'microtask', msg: String(e && e.message || e) }); } },
		innerWidth: 1280, innerHeight: 900, outerWidth: 1280, outerHeight: 900, devicePixelRatio: 1,
		screenX: 0, screenY: 0, scrollX: 0, scrollY: 0,
		Math: Object.create(Math),
		Image: function () { return makeElement('img', doc); },
		Audio: function () { return noopProxy('audio'); },
		AudioContext: function () { return noopProxy('audioctx'); },
		webkitAudioContext: function () { return noopProxy('audioctx'); },
		OfflineAudioContext: function () { return noopProxy('audioctx'); },
		ResizeObserver: function () { return { observe() {}, unobserve() {}, disconnect() {} }; },
		MutationObserver: function () { return { observe() {}, disconnect() {} }; },
		IntersectionObserver: function () { return { observe() {}, disconnect() {} }; },
		FileReader: function () { return noopProxy('filereader'); },
		Blob: function () { return noopProxy('blob'); },
		Event: function (t) { return { type: t, preventDefault() {}, stopPropagation() {} }; },
		CustomEvent: function (t, d) { return { type: t, detail: d && d.detail, preventDefault() {}, stopPropagation() {} }; },
		getComputedStyle: () => makeStyle(),
		matchMedia: () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
		fetch: () => Promise.reject(new Error('offline harness')),
		XMLHttpRequest: function () { return noopProxy('xhr'); },
		Worker: function () { return noopProxy('worker'); },
		Notification: function () { return noopProxy('notif'); },
		alert() {}, confirm: () => true, prompt: () => null, print() {},
		atob: s => Buffer.from(String(s), 'base64').toString('binary'),
		btoa: s => Buffer.from(String(s), 'binary').toString('base64')
	};
	sandbox._h = {};
	sandbox.addEventListener = function (type, fn) { (sandbox._h[type] || (sandbox._h[type] = [])).push(fn); };
	sandbox.removeEventListener = function (type, fn) { const a = sandbox._h[type]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } };
	sandbox.dispatchEvent = function (ev) { return doc._fire(sandbox, ev); };
	sandbox.window = sandbox;
	sandbox.self = sandbox;	sandbox.top = sandbox;
	sandbox.parent = sandbox;
	sandbox.globalThis = sandbox;
	sandbox.frames = sandbox;
	sandbox.AudioContext = sandbox.AudioContext;
	sandbox.webkitAudioContext = sandbox.webkitAudioContext;
	doc.defaultView = sandbox;
	sandbox.Math.random = mulberry32(o.seed === undefined ? 12345 : o.seed);

	const ctx = vm.createContext(sandbox);
	sandbox._vm = ctx;

	const api = {
		sandbox, document: doc, clock, sink, log,
		rafCount: 0,
		fire(target, ev) { return doc._fire(target, ev); },
		resetSink() { sink.arcs.length = 0; sink.rects.length = 0; if (sink.ops) sink.ops.length = 0; },
		recordOps(on) { sink.ops = on ? [] : null; },
		pumpFrame(dtMs) {
			clock.t += dtMs;
			for (let i = timers.length - 1; i >= 0; i--) {
				const t = timers[i];
				if (t.at <= clock.t) {
					if (t.every) t.at = clock.t + t.every; else timers.splice(i, 1);
					try { t.fn(); } catch (e) { log.errors.push({ where: 'timer', msg: String(e && e.message || e) }); }
				}
			}
			const batch = raf.splice(0, raf.length);
			api.rafCount += batch.length;
			for (const r of batch) {
				try { r.cb(clock.t); } catch (e) { log.errors.push({ where: 'raf', msg: String(e && e.message || e), t: clock.t }); raf.length = 0; return false; }
			}
			return batch.length > 0;
		},
		eval(code) { return vm.runInContext(code, ctx); },
		run(code, name) { return vm.runInContext(code, ctx, { filename: name || 'sim.js' }); }
	};
	return api;
}

module.exports = { createSandbox, mulberry32, makeElement, noopProxy };
