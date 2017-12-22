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
  ;

class Log extends EventEmitter {
  constructor(options = {}) {
    super();

    let { id, token, host = 'https://tailf.io', rows, columns, meta, keep_open } = options;

    Object.assign(this, {
        id
      , token
      , host
    });

    this.producer = _.memoize(() => {
      return new Producer({ id, token, host, rows, columns, meta, keep_open });
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

  end(output) {
    let { id, token, host } = this.identity();

    return Promise
            .try(() => {
              if (output) {
                return this.patch({ output });
              }
            })
            .then(() => {
              return Api.end(id, { token, host });
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
    let { uri, id, token, host, keep_open, rows, columns, meta } = options;

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
              if (!id || !token) {
                return Api
                        .open({ id, token, host, rows, columns, meta, keep_open })
                        .then((rec) => {
                          // token, id, uri, host, write_url, read_url
                          let { id, token, host } = rec;

                          return { id, token, host, keep_open, rows, columns, meta };
                        });
              }

              return { id, token, host, keep_open, rows, columns, meta };
            })
            .then((arg) => {
              return new Log(arg);
            });
  }
}

module.exports = Log;
