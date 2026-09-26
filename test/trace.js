'use strict';
const fs = require('fs');
const path = require('path');
const { loadSim } = require('./lib/load');
const { probe, stateOf, rebind } = require('./lib/probe');
const { setCheckbox } = require('./lib/checks');

const args = process.argv.slice(2);
const file = args.find(a => !/^-/.test(a)) || '01-space-bunny-Alpha.html';
const seconds = +(args.find(a => /^--sec=/.test(a)) || '--sec=6').split('=')[1];
const rotate = /--rot/.test(args);
const outPath = args.find(a => /^--out=/.test(a));

const sim = loadSim(path.resolve(file), { fps: 60, seed: 12345, warmup: 0.35 });
const p = probe(sim);
if (sim.info.loadError) { console.error('load failed:', sim.info.loadError); process.exit(1); }
if (rotate) setCheckbox(sim, true);
sim.sb.fire(sim.sb.sandbox, { type: 'keydown', key: 'r', code: 'KeyR' });
sim.step(0.3);
rebind(p, sim.sb);

const rows = ['t,ball_x,ball_y,ball_vx,ball_vy,body_x,body_y,body_vx,body_vy,body_a,body_w'];
for (let f = 0; f < Math.round(seconds * 60); f++) {
	sim.step(1 / 60);
	if (f % 30 === 0) rebind(p, sim.sb);
	const s = stateOf(p);
	rows.push([(f / 60).toFixed(4), s.ball.x, s.ball.y, s.ball.vx, s.ball.vy, s.body.x, s.body.y, s.body.vx, s.body.vy, s.body.a, s.body.w].join(','));
}
const csv = rows.join('\n') + '\n';
if (outPath) { fs.writeFileSync(path.resolve(outPath), csv); console.log('wrote ' + outPath + ' (' + rows.length + ' rows, source=' + (p.level) + ' ball=' + p.names.ball + ' body=' + p.names.body + ')'); }
else process.stdout.write(csv);
