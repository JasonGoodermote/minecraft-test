const assert=require('node:assert/strict');
const {shortStep,horizontalDistance}=require('./navigation');
assert(shortStep({x:0.5,y:0,z:1.5},{x:0.5,y:1,z:0.5}));
assert(shortStep({x:0.5,y:1,z:0.5},{x:1.5,y:1,z:0.5}));
assert(!shortStep({x:0,y:0,z:0},{x:10,y:1,z:0}));
assert.equal(horizontalDistance({x:0,y:0,z:0},{x:0,y:5,z:1}),1);
console.log('PASS: first step and adjacent transitions route to direct walk/jump');
