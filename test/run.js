'use strict';
const fs = require('fs');
const path = require('path');
const { battery, spinProbe, probe, loadSim, I_REF, LIM_REF } = require('./lib/checks');

const ROOT = path.resolve(__dirname, '..');

function listTargets(args) {
	if (args.length) return args.map(a => path.resolve(a));
	const skip = /^index\.html$/i;
	return fs.readdirSync(ROOT)
		.filter(f => /\.(html?|HTML?)$/.test(f) && !skip.test(f))
		.map(f => path.join(ROOT, f))
		.sort();
}

const MARK = { pass: 'ok  ', fail: 'FAIL', warn: 'warn', skip: '--  ' };

function row(name, res) {
	const cells = [];
	for (const c of res.checks) cells.push(MARK[c.status] === undefined ? c.status : MARK[c.status]);
	return { name, cells, res };
}

function main() {
	const args = process.argv.slice(2);
	const only = args.filter(a => !/^-/.test(a));
	const flags = {};
	for (const a of args) if (/^-/.test(a)) flags[a.replace(/^-+/, '')] = true;
	const seconds = +(process.env.SECONDS || (flags.short ? 6 : 10));
	const details = !!flags.details;
	const targets = listTargets(only);
	const results = [];
	for (const f of targets) {
		const base = path.basename(f);
		let rot = null, spin = null;
		try { rot = battery(f, { rotate: false, seconds }); }
		catch (e) { rot = { file: base, checks: [{ name: 'harness', status: 'fail', detail: String(e && e.message || e) }], level: 'error' }; }
		try { spin = spinProbe(f, {}); }
		catch (e) { spin = { file: base, checks: [{ name: 'harness', status: 'fail', detail: String(e && e.message || e) }] }; }
		let probeInfo = null;
		try {
			const sim = loadSim(f, { warmup: 0.2 });
			const p = probe(sim);
			probeInfo = { level: p.level, src: p.src, ball: p.names.ball, body: p.names.body, I: p.const.I || null };
		} catch (e) { probeInfo = { level: 'error', detail: String(e && e.message || e) }; }
		results.push({ base, rot, spin, probe: probeInfo });
		process.stdout.write('.');
	}
	process.stdout.write('\n');

	const names = [];
	for (const r of results) for (const c of r.rot.checks) if (names.indexOf(c.name) < 0) names.push(c.name);
	const spinNames = [];
	for (const r of results) for (const c of r.spin.checks) if (spinNames.indexOf(c.name) < 0) spinNames.push(c.name);

	const pad = (s, n) => String(s).padEnd(n);
	const w = Math.max(30, ...results.map(r => r.base.length));
	let head = pad('file', w) + ' ' + pad('probe', 10) + ' ' + names.map(n => pad(n.slice(0, 9), 10)).join(' ');
	console.log(head);
	console.log('-'.repeat(head.length));
	for (const r of results) {
		const map = {};
		for (const c of r.rot.checks) map[c.name] = c;
		const cells = names.map(n => pad(map[n] ? (MARK[map[n].status] || map[n].status) : '?', 10)).join(' ');
		console.log(pad(r.base, w) + ' ' + pad(r.probe.level, 10) + ' ' + cells);
	}
	if (details) {
		console.log('');
		for (const r of results) {
			console.log('--- ' + r.base + '  probe=' + r.probe.level + '/' + (r.probe.src || '-') + '  ball=' + (r.probe.ball || '-') + '  body=' + (r.probe.body || '-')
				+ '  conv=' + (r.rot.sample ? r.rot.sample.conv + '(' + (r.rot.sample.convConf || '') + ')' : '-')
				+ '  kick=' + (r.rot.sample ? r.rot.sample.kick : '-') + '  frames=' + (r.rot.metrics ? r.rot.metrics.frames : '-'));
			for (const c of r.rot.checks.concat(r.spin.checks)) console.log('    ' + pad(c.status, 5) + pad(c.name, 24) + (c.detail || ''));
		}
	}
	console.log('');
	console.log(pad('file', w) + ' ' + spinNames.map(n => pad(n.slice(0, 9), 10)).join(' '));
	console.log('-'.repeat(w + 1 + spinNames.length * 10));
	for (const r of results) {
		const map = {};
		for (const c of r.spin.checks) map[c.name] = c;
		console.log(pad(r.base, w) + ' ' + spinNames.map(n => pad(map[n] ? (MARK[map[n].status] || map[n].status) : '?', 10)).join(' '));
	}

	const out = { seconds, I_REF, LIM_REF, generated: new Date().toISOString(), results };
	const jsonPath = path.join(__dirname, 'results.json');
	fs.writeFileSync(jsonPath, JSON.stringify(out, null, 1));
	const md = [];
	md.push('# Verification run', '', 'field 1024x1024 wrap xy, ball d=10 m=1, square1 200x200 hole 100x100 m=1, I_ref=' + I_REF.toFixed(2) + ', ' + seconds + 's per battery at 60fps virtual clock, seed 12345', '');
	md.push('| file | probe | ' + names.join(' | ') + ' |');
	md.push('|---|---|' + names.map(() => '---|').join(''));
	for (const r of results) {
		const map = {};
		for (const c of r.rot.checks) map[c.name] = c;
		md.push('| `' + r.base + '` | ' + r.probe.level + ' | ' + names.map(n => map[n] ? (MARK[map[n].status] || map[n].status) + ' ' + detailOf(map[n]) : '?').join(' | ') + ' |');
	}
	md.push('');
	md.push('| file | ' + spinNames.join(' | ') + ' |');
	md.push('|---|' + spinNames.map(() => '---|').join(''));
	for (const r of results) {
		const map = {};
		for (const c of r.spin.checks) map[c.name] = c;
		md.push('| `' + r.base + '` | ' + spinNames.map(n => map[n] ? (MARK[map[n].status] || map[n].status) + ' ' + detailOf(map[n]) : '?').join(' | ') + ' |');
	}
	fs.writeFileSync(path.join(__dirname, 'results.md'), md.join('\n') + '\n');
	console.log('\nwrote ' + path.relative(ROOT, jsonPath) + ' and ' + path.relative(ROOT, path.join(__dirname, 'results.md')));
	for (const r of results) {
		const bad = r.rot.checks.filter(c => c.status === 'fail').concat(r.spin.checks.filter(c => c.status === 'fail'));
		for (const c of bad) console.log('  FAIL ' + r.base + ' :: ' + c.name + ' — ' + c.detail);
	}
}

function detailOf(c) {
	if (c.value === null || c.value === undefined) return '';
	const v = typeof c.value === 'number' ? (Math.abs(c.value) < 1e-3 && c.value !== 0 ? c.value.toExponential(2) : c.value.toFixed(3)) : String(c.value);
	return '(' + v + ')';
}

main();
