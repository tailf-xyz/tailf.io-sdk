'use strict';

var Promise       = require('bluebird')
  , winston       = require('winston')
  , _             = require('lodash')
  , async         = require('async')
  , { URL }       = require('universal-url')
  , EventEmitter  = require('events')
  , through2      = require('through2')
  , sink          = require('through2-sink')
  , timeout       = require('callback-timeout')
  , socket_io     = require('socket.io-client')
  , Api           = require('./api')
  ;

const TIMEOUT_MS_CHUNK  = 500
    , TIMEOUT_MS_END    = 5000
    ;

class Producer extends EventEmitter {
  constructor(options = {}) {
    super();

    let { id, host = 'https://tailf.io', rows, columns, meta, uri, keep_open, subscribers } = options;

    if (uri) {
      // ex: https://tailf.io/XrEOYr3unQkkG6AIMaGo6wfefq3hn53K?subscribers=['', '']
      let url = new URL(uri);

      host = url.origin;

      if (url.searchParams.has('subscribers')) {
        subscribers = url.searchParams.get('subscribers');
      }

      if (url.pathname) {
        id = url.pathname.substring(1);
      }
    }
    
    let rec     = Api.open({ id, host, rows, columns, meta, keep_open })
      , socket  = rec
                  .then((result = {}) => {
                    let { token } = result;

                    return Promise
                            .fromCallback((cb) => {
                              let socket = socket_io(host);

                              socket.tailf = result;

                              socket
                                .on('connect', () => {
                                  socket
                                    .emit('authenticate', { token })
                                    .on('authenticated', () => {
                                      if (_.size(subscribers)) {
                                        socket.emit('join', { subscribers });
                                      }
                                    })
                                    .on('writable', () => {
                                      cb(undefined, socket);
                                    })
                                    .on('unauthorized', (msg) => {
                                      winston.error(`unauthorized`, msg);
                                      socket.disconnect(true);
                                      cb(new Error(`unauthorized`), socket);
                                    });
                                    ;
                                });
                                // .on('disconnect', () =>{
                                //   winston.info('disconnected');
                                // });
                            })
                  });
      ;

    this.rec = () => rec;
    this.socket = () => socket;
  }

  uri() {
    return this
            .rec()
            .then((rec) => {
              let { uri } = rec;

              return uri;
            });
  }

  pipe(proc, cb) {
    let { stdout, stderr } = this.streams({ manual_end : true });

    proc.stdout.pipe(stdout);
    proc.stderr.pipe(stderr);

    async.parallel([
        (cb) => { stdout.on('end', cb) }
      , (cb) => { stderr.on('end', cb) }
    ], (err) => {
      let time = new Date().getTime();

      this
        .socket()
        .then((socket) => {
          return Promise
                  .fromCallback((cb) => socket.emit('end', { time }, cb))
                  .tap(() => {
                    socket.close();
                  });
        })
        .asCallback(cb);
    });
  }

  streams(options) {
    let stdout = this.stream(_.defaults({ type : 'stdout' }, options))
      , stderr = this.stream(_.defaults({ type : 'stderr' }, options))
      ;

    return { stdout, stderr };
  }

  stream(options = {}) {
    let { type, manual_end } = options;

    let transform = (chunk, enc, cb) => {
      let time = new Date().getTime();

      this
        .socket()
        .then((socket) => {
          return Promise
                  .fromCallback((cb) => {
                    if (chunk) {
                      socket.emit('chunk', { time, type, chunk }, timeout((err) => { cb(null, chunk); }, TIMEOUT_MS_CHUNK));
                    } else {
                      if (!manual_end) {
                        socket.emit('end', { time, type }, timeout((err) => {
                          socket.close();
                          cb(null, chunk);
                        }, TIMEOUT_MS_END));
                      } else {
                        cb();
                      }
                    }
                  });
        })
        .catch((err) => {
          winston.error(err);
          throw err;
        })
        .asCallback(cb);
    };

    let flush = (cb) => {
      let time = new Date().getTime();

      this
        .socket()
        .then((socket) => {
          return Promise
                  .fromCallback((cb) => {
                    if (!manual_end) {
                      socket.emit('end', { time, type }, timeout((err) => {
                        socket.close();
                        cb();
                      }, TIMEOUT_MS_END));
                    } else {
                      cb();
                    }
                  });
        })
        .catch((err) => {
          winston.error(err);
          throw err;
        })
        .asCallback(cb);
    };

    // let ret = through2.obj(transform, flush);
    // ret.pipe(sink.obj(() => {}));

    let ret = through2(transform, flush);
    ret.pipe(sink(() => {}));

    return ret;
  }
}

module.exports = Producer;
