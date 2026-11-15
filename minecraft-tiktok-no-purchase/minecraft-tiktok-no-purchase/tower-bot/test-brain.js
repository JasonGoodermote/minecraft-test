const assert=require('node:assert/strict');const {decide,STATES}=require('./brain');
const b={step:100,maxSteps:16525,blastUntil:0,navFailures:0,falling:false};
assert.equal(decide(b),STATES.BUILD);assert.equal(decide({...b,step:16525}),STATES.WIN);
console.log('PASS: brain build/win');
