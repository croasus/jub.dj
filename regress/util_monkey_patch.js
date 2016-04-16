var ju = require('../lib/jub_util.js');
ju.monkeyPatch();


console.log('partition')
var a = [1, 2, 3, 4];
var parts;
console.log(a);

parts = a.partition(function(v) { return true; });
console.log(parts);

parts = a.partition(function(v) { return false; });
console.log(parts);

parts = a.partition(function(v, i, arr) { return v % 2 === 0; });
console.log(parts);

parts = a.partition(function(v, i, arr) { return i % 2 === 0; });
console.log(parts);

parts = a.partition(function(v, i, arr) { return arr.length === 4 });
console.log(parts);


console.log('flatten')
a = [[1,2], [3,4]]
console.log(a);
console.log(a.flatten());
a = [[1,2], [3,[4]]]
console.log(a);
console.log(a.flatten());

console.log('remove')
var r;
a = ['a', 'b', 'b', 'd'];
console.log(a);
r = a.remove('a');
console.log(r, a);
r = a.remove('a');
console.log(r, a);
r = a.remove('b');
console.log(r, a);
