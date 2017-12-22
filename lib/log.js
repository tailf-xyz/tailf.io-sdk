'use strict';

var Promise       = require('bluebird')
  , winston       = require('winston')
  , _             = require('lodash')
  , { URL }       = require('universal-url')
  , EventEmitter  = require('events')
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
      return new Promise({ id, token, host, rows, columns, meta, keep_open });
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

    return Promise.resolve({ id, token, host });
  }

  on(name, cb) {
    switch(name) {
      case 'chunk':
      case 'data':
      case 'end':
      this.client();
      break;
    }

    return super.on(on, cb);
  }

  write(...arg) {
    return this.stdout.write(...arg);
  }

  error(...arg) {
    return this.stderr.write(...arg);
  }

  end(output) {
    return this
            .identity()
            .tap((identity) => {
              if (output) {
                return this.patch({ output });
              }
            })
            .then((identity) => {
              let { id, token, host } = identity;

              return Api.end(id, { token, host });
            });
  }

  patch(meta) {
    return this
            .identity()
            .then((identity) => {
              let { id, token, host } = identity;

              return Api.patch(id, meta, { token, host });
            });
  }

  read() {
    return this
            .identity()
            .then((identity) => {
              let { id, token, host } = identity;

              return Api.read(id, { token, host });
            })
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
              if (!id) {
                return Api
                        .open({ token, host, rows, columns, meta, keep_open })
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
