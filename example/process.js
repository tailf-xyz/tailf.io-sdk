let { Producer }  = require('../')
  , { spawn }     = require('child_process')
  ;

let prod = (new Producer({}));
let child = spawn('node', ['-e', `
let li  = require('lorem-ipsum')
  , o   = li()
  , e   = li()
  ;

console.log(o);
console.error(o);
`]);

prod.pipe(child, () => {
  process.exit();
});

prod.uri().then((uri) => {
  console.log(uri);
});
