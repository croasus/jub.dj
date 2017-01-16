var ju = require('../../lib/jub_util.js');
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

console.log('ifLet')
let ifLet = ju.ifLet;
ifLet(null,
      res => { console.log('should not see this.') },
      res => { console.log('should see this.') });
ifLet(false,
      res => { console.log('should not see this.') },
      res => { console.log('should see this.') });
ifLet(undefined,
      res => { console.log('should not see this.') },
      res => { console.log('should see this.') });
ifLet(0,
      res => { console.log(res + 1) },
      res => { console.log(res - 1) });
ifLet('',
      res => { console.log(res + 'a') },
      res => { console.log(res + 'b') });
ifLet({},
      res => { console.log(res) });
console.log(ifLet(1 + 1,
                  res => { return res + 1; }));
console.log(ifLet(null,
                  null,
                  res => { return 'else'; }));

console.log('getIn')
let getIn = ju.getIn;
console.log(getIn({ a: { b: 1 } }, ['a', 'b'], 'default'))
console.log(getIn({ a: { b: 1 } }, ['a', 'b', 'c']))
console.log(getIn({ a: { b: 1 } }, []))
console.log(getIn({ a: { b: 1 } }, ['a']))
console.log(getIn({ a: { b: 1 } }, ['a', 'c']))
