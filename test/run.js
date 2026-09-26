'use strict';
const fs = require('fs');
const path = require('path');
const { battery, spinProbe, probe, loadSim, I_REF, LIM_REF } = require('./lib/checks');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const JSON_PATH = path.join(__dirname, 'results.json');
const MD_PATH = path.join(__dirname, 'results.md');

const MARK = { pass: 'ok  ', fail: 'FAIL', warn: 'warn', skip: '--  ' };
const RANK = { pass: 2, warn: 1, fail: 0 };
const BOOLS = new Set(['short', 'details', 'fresh', 'help', 'rot', 'quiet']);
const HV = '2';

function pad(s, n) { return String(s).padEnd(n); }

function parseArgs(argv) {
	const f = { targets: [], flags: {} };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.slice(0, 2) !== '--') { f.targets.push(a); continue; }
		const eq = a.indexOf('=');
		const name = eq < 0 ? a.slice(2) : a.slice(2, eq);
		if (eq >= 0) f.flags[name] = a.slice(eq + 1);
		else if (BOOLS.has(name)) f.flags[name] = true;
		else if (argv[i + 1] !== undefined && argv[i + 1][0] !== '-') f.flags[name] = argv[++i];
		else f.flags[name] = true;
	}
	return f;
}

function listTargets(args) {
	if (args.length) return args.map(a => path.resolve(a));
	const skip = /^index\.html$/i;
	return fs.readdirSync(ROOT)
		.filter(f => /\.html?$/i.test(f) && !skip.test(f))
		.map(f => path.join(ROOT, f))
		.sort();
}

function baselineFromIndex(target) {
	if (!fs.existsSync(INDEX)) return null;
	const html = fs.readFileSync(INDEX, 'utf8');
	const mine = path.basename(target);
	const round = mine.match(/^0*(\d+)/);
	const wanted = round ? 'Round ' + Number(round[1]) : null;
	const sections = html.split(/<h2[^>]*>/i).slice(1);
	const all = [];
	for (const s of sections) {
		const m = s.match(/<div class="card best">[\s\S]*?href="([^"]+\.html?)"/i);
		if (m) all.push({ section: s.slice(0, 40), file: m[1] });
	}
	if (!all.length) return null;
	const own = all.find(b => b.file === mine);
	if (wanted) {
		const same = all.filter(b => b.section.toLowerCase().indexOf(wanted.toLowerCase()) === 0 && b.file !== mine);
		if (same.length) return same[0].file;
	}
	return (all.find(b => b.file !== mine) || {}).file || own.file;
}

function measure(file, seconds) {
	const base = path.basename(file);
	let rot = null, spin = null, probeInfo = null;
	try { rot = battery(file, { rotate: false, seconds }); }
	catch (e) { rot = { file: base, checks: [{ name: 'harness', status: 'fail', detail: String(e && e.message || e) }], level: 'error' }; }
	try { spin = spinProbe(file, {}); }
	catch (e) { spin = { file: base, checks: [{ name: 'harness', status: 'fail', detail: String(e && e.message || e) }] }; }
	try {
		const sim = loadSim(file, { warmup: 0.2 });
		const p = probe(sim);
		probeInfo = { level: p.level, src: p.src, ball: p.names.ball, body: p.names.body, I: p.const.I || null };
	} catch (e) { probeInfo = { level: 'error', detail: String(e && e.message || e) }; }
	return { base, mtime: mtimeOf(file), seconds, hv: HV, rot, spin, probe: probeInfo };
}

function mtimeOf(file) {
	try { return fs.statSync(file).mtimeMs; } catch (e) { return 0; }
}

function readSnapshot() {
	try {
		const s = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
		return s && Array.isArray(s.results) ? s : { results: [] };
	} catch (e) { return { results: [] }; }
}

function cached(snap, file, seconds) {
	const base = path.basename(file);
	const hit = snap.results.find(r => r.base === base);
	if (!hit || hit.hv !== HV || hit.mtime !== mtimeOf(file) || hit.seconds !== seconds) return null;
	return hit;
}

function num(v) {
	if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) return 'n/a';
	if (typeof v !== 'number') return String(v);
	if (v === 0) return '0';
	if (Math.abs(v) < 1e-3) return v.toExponential(2);
	if (Math.abs(v) >= 1e5) return v.toExponential(2);
	return v.toFixed(3);
}

function checksOf(entry) {
	const all = entry.rot.checks.concat(entry.spin.checks);
	const map = {};
	for (const c of all) map[c.name] = c;
	return map;
}

function metricsOf() {
	return [
		{ k: 'probe', label: 'probe level', get: e => e.probe.level, hard: false },
		{ k: 'offset', label: 'max ball offset px', get: e => M(e).offMax, low: true, hard: true },
		{ k: 'jump', label: 'position jump px', get: e => M(e).jumpMax, low: true, hard: true },
		{ k: 'fid', label: 'time fidelity', get: e => M(e).fidelity, near1: true, hard: true },
		{ k: 'ke', label: 'KE drift |dKE|/KE', get: e => M(e).driftKE, low: true, hard: true },
		{ k: 'p', label: '|dP| px*m/s', get: e => M(e).dP, low: true, hard: true },
		{ k: 'l', label: '|dL| wall-only', get: e => M(e).dL, low: true, hard: false },
		{ k: 'w', label: 'omega max rad/s', get: e => M(e).omegaMax, low: false, hard: false },
		{ k: 'I', label: 'inertia I', get: e => M(e).I, low: false, hard: true },
		{ k: 'frames', label: 'frames measured', get: e => M(e).frames, low: false, hard: false },
		{ k: 'spin', label: 'spin omega (rot on)', get: e => S(e).omegaMax, low: false, hard: true },
		{ k: 'keSpin', label: 'KE drift while spinning', get: e => S(e).dKE, low: true, hard: true }
	];
}

function M(e) { return (e.rot && e.rot.metrics) || {}; }
function S(e) { return (e.spin && e.spin.metrics) || {}; }

function isNum(v) { return typeof v === 'number' && isFinite(v); }

function compare(a, b) {
	const w = 34, c1 = Math.max(...[a.base, b.base].map(s => s.length)) + 2, c2 = c1;
	console.log('');
	console.log('compare  ' + a.base + '  vs  ' + b.base);
	console.log(pad('metric', w) + pad(a.base, c1) + pad(b.base, c2) + 'verdict');
	console.log('-'.repeat(w + c1 + c2 + 20));
	const lines = [];
	for (const m of metricsOf()) {
		const va = m.get(a), vb = m.get(b);
		let v = '';
		if (isNum(va) && isNum(vb) && m.hard) {
			if (m.near1) {
				const da = Math.abs(va - 1), db = Math.abs(vb - 1);
				v = da <= db * 1.05 + 1e-6 ? 'same' : (da < db ? 'better' : 'worse');
			} else if (m.low) {
				v = vb === 0 ? (va === 0 ? 'same' : 'worse') : (va <= vb * 1.05 ? 'same' : (va < vb ? 'better' : 'worse ' + num(va / vb) + 'x'));
			} else v = Math.abs(va - vb) < 1e-9 ? 'same' : 'differs';
		}
		lines.push({ label: m.label, hard: !!m.hard, v: v, text: pad(m.label, w) + pad(num(va) || String(va), c1) + pad(num(vb) || String(vb), c2) + v });
	}
	for (const l of lines) console.log(l.text);
	const worse = lines.filter(l => l.hard && l.v.indexOf('worse') === 0);
	const better = lines.filter(l => l.hard && l.v === 'better');
	const ca = checksOf(a), cb = checksOf(b);
	const hardNames = Object.keys(ca).filter(n => ca[n].status !== 'skip' && !/time fidelity \(rot/.test(n));
	const rank = [];
	for (const n of hardNames) {
		const ra = ca[n], rb = cb[n] || { status: 'skip' };
		if (!RANK[rb.status]) continue;
		const d = RANK[ra.status] - RANK[rb.status];
		if (d) rank.push((d < 0 ? 'WORSE ' : 'better ') + n + ' (' + ra.status + ' vs ' + rb.status + ')');
	}
	console.log('');
	console.log('hard checks: ' + hardNames.filter(n => ca[n].status === 'pass').length + '/' + hardNames.length + ' pass'
		+ (b === a ? '' : ', baseline ' + hardNames.filter(n => (cb[n] || {}).status === 'pass').length + '/' + hardNames.length));
	if (worse.length) console.log('metrics worse than baseline: ' + worse.map(l => l.label).join(', '));
	if (better.length) console.log('metrics better than baseline: ' + better.map(l => l.label).join(', '));
	if (rank.length) console.log('check ranks: ' + rank.join('; '));
	const fails = hardNames.filter(n => ca[n].status === 'fail');
	if (fails.length) console.log('FAILS: ' + fails.map(n => n + ' — ' + ca[n].detail).join(' | '));
	const unver = hardNames.filter(n => ca[n].status === 'skip');
	if (unver.length) console.log('unverified: ' + unver.map(n => n + ' — ' + ca[n].detail).join(' | '));
	if (!worse.length && !rank.some(r => r.indexOf('WORSE') === 0)) console.log('verdict: no hard regression against the baseline');
}

function mergeSnapshot(snap, fresh) {
	const by = new Map(snap.results.filter(r => fs.existsSync(path.join(ROOT, r.base))).map(r => [r.base, r]));
	for (const r of fresh) by.set(r.base, r);
	const list = [...by.values()].sort((a, b) => a.base.localeCompare(b.base));
	return { seconds: list.length ? list[0].seconds : 0, hv: HV, I_REF, LIM_REF, generated: new Date().toISOString(), results: list };
}

function nameList(list) {
	const names = [];
	for (const r of list) for (const c of r.rot.checks) if (names.indexOf(c.name) < 0) names.push(c.name);
	return names;
}

function table(list) {
	const names = nameList(list);
	const w = Math.max(30, ...list.map(r => r.base.length));
	let head = pad('file', w) + ' ' + pad('probe', 10) + ' ' + names.map(n => pad(n.slice(0, 9), 10)).join(' ');
	console.log(head);
	console.log('-'.repeat(head.length));
	for (const r of list) {
		const map = checksOf(r);
		const cells = names.map(n => pad(map[n] ? (MARK[map[n].status] || map[n].status) : '?', 10)).join(' ');
		console.log(pad(r.base, w) + ' ' + pad(r.probe.level, 10) + ' ' + cells);
	}
	return names;
}

function spinTable(list) {
	const names = [];
	for (const r of list) for (const c of r.spin.checks) if (names.indexOf(c.name) < 0) names.push(c.name);
	const w = Math.max(30, ...list.map(r => r.base.length));
	console.log('');
	console.log(pad('file', w) + ' ' + names.map(n => pad(n.slice(0, 9), 10)).join(' '));
	console.log('-'.repeat(w + 1 + names.length * 10));
	for (const r of list) {
		const map = {};
		for (const c of r.spin.checks) map[c.name] = c;
		console.log(pad(r.base, w) + ' ' + names.map(n => pad(map[n] ? (MARK[map[n].status] || map[n].status) : '?', 10)).join(' '));
	}
}

function details(list) {
	for (const r of list) {
		console.log('--- ' + r.base + '  probe=' + r.probe.level + '/' + (r.probe.src || '-') + '  ball=' + (r.probe.ball || '-') + '  body=' + (r.probe.body || '-')
			+ '  conv=' + (r.rot.sample ? r.rot.sample.conv + '(' + (r.rot.sample.convConf || '') + ')' : '-')
			+ '  kick=' + (r.rot.sample ? r.rot.sample.kick : '-') + '  reset=' + (r.rot.sample ? r.rot.sample.reset : '-')
			+ '  frames=' + (r.rot.metrics ? r.rot.metrics.frames : '-'));
		for (const c of r.rot.checks.concat(r.spin.checks)) console.log('    ' + pad(c.status, 5) + pad(c.name, 24) + (c.detail || ''));
	}
}

function detailOf(c) {
	if (c.value === null || c.value === undefined) return '';
	return ' (' + num(c.value) + ')';
}

function writeMd(snap, names) {
	const list = snap.results;
	const secs = [...new Set(list.map(r => r.seconds))];
	const md = [];
	md.push('# Verification run', '');
	md.push('field 1024x1024 wrap xy, ball d=10 m=1, square1 200x200 hole 100x100 m=1, I_ref=' + I_REF.toFixed(2)
		+ ', 60fps virtual clock, seed 12345, ' + secs.join('/') + 's per battery');
	md.push('');
	md.push('| file | probe | ' + names.join(' | ') + ' |');
	md.push('|---|---|' + names.map(() => '---|').join(''));
	for (const r of list) {
		const map = checksOf(r);
		md.push('| `' + r.base + '` | ' + r.probe.level + ' | ' + names.map(n => map[n] ? (MARK[map[n].status] || map[n].status) + detailOf(map[n]) : '?').join(' | ') + ' |');
	}
	const spinNames = [];
	for (const r of list) for (const c of r.spin.checks) if (spinNames.indexOf(c.name) < 0) spinNames.push(c.name);
	md.push('');
	md.push('| file | ' + spinNames.join(' | ') + ' |');
	md.push('|---|' + spinNames.map(() => '---|').join(''));
	for (const r of list) {
		const map = {};
		for (const c of r.spin.checks) map[c.name] = c;
		md.push('| `' + r.base + '` | ' + spinNames.map(n => map[n] ? (MARK[map[n].status] || map[n].status) + detailOf(map[n]) : '?').join(' | ') + ' |');
	}
	md.push('');
	fs.writeFileSync(MD_PATH, md.join('\n') + '\n');
	return list;
}

function usage() {
	console.log([
		'usage: node test/run.js [flags] [file.html ...]',
		'',
		'  (no files)        measure every *.html in the repo root',
		'  file.html ...    measure only these, merge into test/results.{json,md}',
		'  --vs <file>      print a metric-by-metric compare against that file',
		'  --vs auto        baseline = the `card best` of the same Round in index.html',
		'  --details        per-check numbers, detected conventions, field names',
		'  --short          6s per battery instead of 10s (SECONDS=n also works)',
		'  --fresh          ignore the mtime cache in test/results.json',
		'',
		'  node test/trace.js <file> --sec=6 --rot --out=t.csv   per-frame CSV'
	].join('\n'));
}

function main() {
	const { targets, flags } = parseArgs(process.argv.slice(2));
	if (flags.help) { usage(); return; }
	const seconds = +(process.env.SECONDS || (flags.short ? 6 : 10));
	const files = listTargets(targets);
	const snap = readSnapshot();
	const fresh = [];
	for (const f of files) {
		const hit = !flags.fresh && cached(snap, f, seconds);
		if (hit) { fresh.push(hit); process.stdout.write('='); continue; }
		fresh.push(measure(f, seconds));
		process.stdout.write('.');
	}
	process.stdout.write('\n');

	const names = table(fresh);
	if (flags.details) { console.log(''); details(fresh); }
	spinTable(fresh);

	if (flags.vs) {
		const target = targets[0] || files[0];
		let base = flags.vs === true ? null : flags.vs;
		if (flags.vs === 'auto' || (!base && !targets[1])) base = baselineFromIndex(path.resolve(target));
		if (base) {
			const bf = path.resolve(base);
			let entry = !flags.fresh && cached(snap, bf, seconds);
			if (!entry) { entry = measure(bf, seconds); process.stdout.write('.'); }
			compare(fresh.find(r => r.base === path.basename(target)) || fresh[0], entry);
		} else {
			console.log('no baseline: give --vs <file.html> or --vs auto (no `card best` found in index.html)');
		}
	}

	const out = mergeSnapshot(snap, fresh);
	fs.writeFileSync(JSON_PATH, JSON.stringify(out, null, 1));
	writeMd(out, nameList(out.results));
	console.log('');
	console.log('wrote ' + path.relative(ROOT, JSON_PATH) + ' and ' + path.relative(ROOT, MD_PATH));
	const ran = new Set(fresh.map(r => r.base));
	const failsOf = list => list.flatMap(r => r.rot.checks.filter(c => c.status === 'fail').concat(r.spin.checks.filter(c => c.status === 'fail')).map(c => r.base + ' :: ' + c.name + ' — ' + c.detail));
	const mine = failsOf(fresh);
	const rest = failsOf(out.results.filter(r => !ran.has(r.base)));
	for (const l of mine) console.log('  FAIL ' + l);
	console.log(out.results.length + ' files in the snapshot, ' + (mine.length + rest.length) + ' hard fails total'
		+ (rest.length ? ' (' + rest.length + ' in files not touched by this run — see ' + path.relative(ROOT, MD_PATH) + ')' : ''));
}

main();
