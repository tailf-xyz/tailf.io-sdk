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
    let { end = true } = options;

    let stdout = this.stdout()
      , stderr = this.stderr()
      ;

    proc.stdout.pipe(stdout, { end });
    proc.stderr.pipe(stderr, { end });

    let e = Promise.fromCallback((cb) => proc.on('exit', (code, sig) => cb(undefined, { code, sig })));

    let arr = [e];

    if (end) {
      // todo [akamel] should be stdout.on('end') but that doesn't fire
      let a = Promise.fromCallback((cb) => proc.stdout.on('end', cb))
        , b = Promise.fromCallback((cb) => proc.stderr.on('end', cb))
        ;

      arr = [e, a, b];
    }

    return Promise
            .all(arr)
            .then((result) => result[0])
            .tap((output) => {
              if (end) {
                return this.end(undefined, output);
              }
            })
            .tap((output = {}) => {
              let { code } = output;

              if (code) {
                let err = new Error(`process exited with code ${code}`);
                err.code = code;
                throw err;
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

  end(err, output) {
    let { id, token, host } = this.identity();

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
                return this.patch(patch);
              }
            })
            .then(() => {
              return Api.end(id, { token, host });
            })
            .delay(15 * 1000)
            .tap(() => {
              let p = this.producer.cache.get();
              if (p) {
                return p.socket().then((socket) => socket.close());
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
