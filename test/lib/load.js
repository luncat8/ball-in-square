'use strict';
const fs = require('fs');
const path = require('path');
const { createSandbox } = require('./sandbox');

function extractScripts(html) {
	const out = [];
	const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
	let m;
	while ((m = re.exec(html))) {
		const attrs = m[1] || '';
		if (/\bsrc\s*=/i.test(attrs)) continue;
		const type = (attrs.match(/\btype\s*=\s*["']?([\w-]+)/i) || [])[1];
		out.push({ code: m[2], type: (type || 'text/javascript').toLowerCase(), index: out.length });
	}
	return out;
}

function precreateElements(sb, html) {
	const doc = sb.document;
	const re = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
	let m;
	while ((m = re.exec(html))) {
		const tag = m[1].toLowerCase();
		const attrs = m[2] || '';
		const id = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1];
		if (!id || /^(script|style|meta|link|title|head|html|body)$/.test(tag)) continue;
		const el = doc.getElementById(id);
		el.tagName = tag.toUpperCase();
		const ty = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1];
		if (ty) el.type = ty;
		if (/\bchecked\b/i.test(attrs)) el.checked = true;
		if (/\bdisabled\b/i.test(attrs)) el.disabled = true;
		if (/\bselected\b/i.test(attrs)) el.selected = true;
		const w = (attrs.match(/\bwidth\s*=\s*["']?(\d+)/i) || [])[1];
		const h = (attrs.match(/\bheight\s*=\s*["']?(\d+)/i) || [])[1];
		if (tag === 'canvas') {
			el.width = w ? +w : 1024;
			el.height = h ? +h : 1024;
		}
		const cl = (attrs.match(/\bclass\s*=\s*["']([^"']+)["']/i) || [])[1];
		if (cl) el.className = cl;
	}
	for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
		const attrs = m[1] || '';
		const id = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1];
		const el = id ? doc.getElementById(id) : doc.createElement('input');
		el.tagName = 'INPUT';
		el.type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || 'text';
		if (/\bchecked\b/i.test(attrs)) el.checked = true;
	}
	return doc;
}

function findCanvas(doc, html) {
	let best = null;
	for (const m of html.matchAll(/<canvas\b([^>]*)>/gi)) {
		const id = (m[1].match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1];
		const el = id ? doc.getElementById(id) : doc.createElement('canvas');
		el.tagName = 'CANVAS';
		const w = (m[1].match(/\bwidth\s*=\s*["']?(\d+)/i) || [])[1];
		const h = (m[1].match(/\bheight\s*=\s*["']?(\d+)/i) || [])[1];
		el.width = w ? +w : 1024;
		el.height = h ? +h : 1024;
		if (!best) best = el;
	}
	if (!best) {
		for (const el of doc._byId.values()) if (el.tagName === 'CANVAS') { best = el; break; }
	}
	return best;
}

function loadSim(file, opts) {
	const o = opts || {};
	const abs = path.resolve(file);
	const html = fs.readFileSync(abs, 'utf8');
	const sb = createSandbox({ seed: o.seed === undefined ? 12345 : o.seed });
	precreateElements(sb, html);
	const canvas = findCanvas(sb.document, html);
	const scripts = extractScripts(html);
	const info = { file: abs, name: path.basename(abs), canvas, scripts: scripts.length, module: false, loadError: null };
	if (!scripts.length) { info.loadError = 'no inline script found'; return { sb, info, canvas, step() { return false; }, dispose() {} }; }
	if (scripts.some(s => s.type === 'module')) { info.module = true; }
	for (const s of scripts) {
		if (s.type === 'module') { info.loadError = 'ES module script cannot be evaluated in the vm harness'; break; }
		try { sb.run(s.code, info.name + '#' + s.index); }
		catch (e) { info.loadError = String(e && e.message || e); break; }
	}
	const dtMs = 1000 / (o.fps || 60);
	const step = (seconds) => {
		const n = Math.max(1, Math.round(seconds * (o.fps || 60)));
		for (let i = 0; i < n; i++) if (!sb.pumpFrame(dtMs)) return i;
		return n;
	};
	const api = {
		sb, info, canvas, step,
		seconds: () => sb.clock.t / 1000,
		dispose() {}
	};
	if (o.warmup !== false && !info.loadError) { try { step(o.warmup === undefined ? 0.5 : o.warmup); } catch (e) { info.loadError = String(e && e.message || e); } }
	return api;
}

module.exports = { loadSim, extractScripts, precreateElements, findCanvas };
