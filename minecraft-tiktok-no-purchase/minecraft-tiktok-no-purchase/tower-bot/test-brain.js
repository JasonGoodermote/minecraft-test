'use strict';
const assert=require('node:assert/strict');
const {STATES,decide}=require('./brain');
assert.equal(decide({step:42,maxSteps:7500,now:1}),STATES.BUILD);
assert.equal(decide({step:42,maxSteps:7500,now:1,blastUntil:2}),STATES.WAIT_TNT);
assert.equal(decide({step:42,maxSteps:7500,now:1,routeDamaged:true}),STATES.RECOVER);
assert.equal(decide({step:42,maxSteps:7500,now:1,navFailures:2}),STATES.REPLAN);
assert.equal(decide({step:7500,maxSteps:7500,now:1}),STATES.WIN);
console.log('PASS: tower controller prioritizes TNT, recovery, replanning, construction, and win');
