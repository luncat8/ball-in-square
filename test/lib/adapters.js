'use strict';

const ADAPTERS = {
	'01_hy3.html': {
		ball: 'ball',
		body: 'obj',
		conv: { ballVel: 'local' },
		note: 'obj = {cx,cy,vx,vy,angle,omega}; ball = {bx,by,bvx,bvy} in the body local frame'
	}
};

module.exports = { ADAPTERS };
