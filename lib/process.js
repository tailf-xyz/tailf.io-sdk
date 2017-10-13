var Promise     = require('bluebird')
  , Producer    = require('./producer')
  ;

class Process extends EventEmitter {
  constructor(proc) {
    this.proc = proc;
  }

  pipe(options = {}) {
    let { proc }  = this
      , prod      = new Producer(options)
      , stdout    = prod.stream('stdout')
      , stderr    = prod.stream('stderr')
      ;

    proc.stdout.pipe(stdout);
    proc.stderr.pipe(stderr);
  }
}

module.exports = Process;
