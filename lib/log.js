'use strict';

var Promise       = require('bluebird')
  , winston       = require('winston')
  , _             = require('lodash')
  , { URL }       = require('universal-url')
  , EventEmitter  = require('events')
  , util          = require('util')
  , Api           = require('./api')
  , Producer      = require('./producer')
  , Client        = require('./client')
  , async         = require('async')
  ;

class Log extends EventEmitter {
  constructor(options = {}) {
    super();

    let { id, token, host = 'https://tailf.io' }  = options
      , rest = _.omit(options, ['id', 'token', 'host'])
      ;

    Object.assign(this, {
        id
      , token
      , host
    });

    this.producer = _.memoize(() => {
      let rec = { id, token, host, ...rest };
      return new Producer({ ...rec, __REC__ : rec });
    });

    this.client = _.memoize(() => {
      let ret = new Client(host, { id, token });

      _.each(['chunk', 'data', 'end'], (e) => ret.on(e, (...arg) => this.emit(e, ...arg)));

      return ret;
    });

    this.stdout = _.memoize(() => this.producer().stream({ type : 'stdout' }));
    this.stderr = _.memoize(() => this.producer().stream({ type : 'stderr' }));
  }

  identity() {
    let { id, token, host } = this;

    return { id, token, host };
  }

  on(name, cb) {
    switch(name) {
      case 'chunk':
      case 'data':
      case 'end':
      this.client();
      break;
    }

    return super.on(name, cb);
  }

  pipe(proc, options = {}, cb) {
    let { end = true, end_delay, verbose_debug } = options;
    if (verbose_debug) {
      this.log(`${new Date().toISOString()} - Task pipe, end = ${end}`);
    }

    let stdout = this.stdout()
      , stderr = this.stderr()
      ;

    proc.stdout.pipe(stdout, { end: false });
    proc.stderr.pipe(stderr, { end: false });

    let e = Promise.fromCallback((cb) => proc.on('exit', (code, sig) => cb(undefined, { code, sig })))
      , a = Promise.fromCallback((cb) => proc.stdout.on('end', cb))
      , b = Promise.fromCallback((cb) => proc.stderr.on('end', cb))
      ;

    let arr = [e, a, b];
  
    return Promise
            .all(arr)
            .tap(() => {
              if (verbose_debug) {
                this.log(`${new Date().toISOString()} - Task ended in pipe`);
              }

              if (_.isNumber(end_delay) && end_delay > 0) {
                if (verbose_debug) {
                  this.log(`Waiting ${end_delay} ms...`);
                }

                return Promise.delay(end_delay);
              }
            })
            .then((result) => result[0])
            .tap((output = {}) => {
              if (!_.isEmpty(output) && verbose_debug) {
                this.log(`Output: ${JSON.stringify(output)}`);
              }

              let { code } = output;

              if (code) {
                if (verbose_debug) {
                  this.log(`Process exited with code ${code}`);
                }

                let err = new Error(`process exited with code ${code}`);
                err.code = code;
                return Promise
                        .try(() => {
                          if (end) {
                            if (verbose_debug) {
                              this.log('Ending task with error exit code');
                            }

                            return this.end(err, undefined, { verbose_debug });
                          }
                        })
                        .then(() => {
                          throw err;
                        });
              }

              if (end) {
                if (verbose_debug) {
                  this.log('Ending task from pipe with output');
                }

                return this.end(undefined, output, { verbose_debug });
              }
            })
            .tapCatch((err) => {
              if (verbose_debug) {
                this.log(`${new Date().toISOString()} - Error happened in task pipe, error = ${err.toString()}`);
              }
            })
            .asCallback(cb);
  }

  write(...arg) {
    return this.stdout().write(...arg);
  }

  error(...arg) {
    return this.stderr().write(...arg);
  }

  log(...arg) {
    let str = _.map(arg, (i) => {
      if (_.isObject(i)) {
        return JSON.stringify(i);
      }

      return i;
    }).join(' ');

    return this.write(`${str}\n`);
  }

  dir(arg, options) {
    let str = util.inspect(arg, options);
    return this.write(`${str}\n`);
  }

  end(err, output, options = {}) {
    let { id, token, host } = this.identity();
    let { verbose_debug } = options;
    if (verbose_debug) {
      this.log(`${new Date().toISOString()} - Task Log End`);
    }

    return Promise
            .try(() => {
              let error = undefined;

              if (_.isString(err)) {
                error = { message: err };
              }
              else if (err) {
                let { name, message, stack } = err;
                let filtered_err = _.pickBy({ name, message, stack }, _.identity);
                error = { ...filtered_err, ..._.omit(err, ['name', 'message', 'stack']) };
              }

              let patch = _.omitBy({ error , output }, _.isEmpty);

              if (!_.isEmpty(patch)) {
                if (verbose_debug) {
                  this.log(`Patching task from task end, meta = ${JSON.stringify(patch)}`);
                }

                return this.patch(patch);
              } else if (verbose_debug) {
                this.log('Nothing to patch from task end');
              }
            })
            .then(() => {
              if (verbose_debug) {
                this.log(`${new Date().toISOString()} - Api end from task end`);
              }

              return Api.end(id, { token, host });
            })
            .delay(15 * 1000)
            .tap(() => {
              return this.close_socket();
            })
            .tapCatch((err) => {
              if (verbose_debug) {
                this.log(`${new Date().toISOString()} - Error happened in task end, error = ${err.toString()}`);
              }
            });
  }

  close_socket() {
    return Promise
     .try(() => {
       let p = this.producer.cache.get();
       if (p) {
         return p
                .socket()
                .then((socket) => {
                  if (!_.isNil(socket)) {
                    socket.close();
                  }
                });
       }
     });
  }

  patch(meta) {
    let { id, token, host } = this.identity();

    return Api.patch(id, meta, { token, host });
  }

  read() {
    let { id, token, host } = this.identity();

    return Api.read(id, { token, host });
  }

  readOnEnd() {
    return Promise
            .fromCallback((cb) => {
              this.on('end', () => cb());
            })
            .then(() => this.read());
  }

  stringify() {
    let { id, host }  = this
      , url           = new URL(host)
      ;

    url.pathname = id;

    return url.toString();
  }

  toString() {
    return this.stringify();
  }

  static open(options = {}) {
    let { uri, id, token, host } = options;

    if (_.isString(options)) {
      uri = options;
      // in case input 'options' has id, token or host set as properties
      id = undefined;
      token = undefined;
      host = undefined;
      options = {};
    }

    if (uri) {
      let url     = new URL(uri)
        , params  = url.searchParams
        ;

      if (url.pathname) {
        id = url.pathname.substring(1);
      }

      if (params.has('token')) {
        token = params.get('token');
      }

      host = url.origin
    }

    return Promise
            .try(() => {
              let rest = _.omit(options, ['uri', 'id', 'token', 'host']);

              if (!id || !token) {
                return Api
                        .open({ id, token, host, ...rest })
                        .then((rec) => {
                          // token, id, uri, host, write_url, read_url
                          let { id, token, host } = rec;

                          return { id, token, host, ...rest };
                        });
              }

              return { id, token, host, ...rest };
            })
            .then((arg) => {
              return new Log(arg);
            });
  }
}

module.exports = Log;
