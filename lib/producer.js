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

    let { id, host = 'https://tailf.io', rows, columns, meta, uri, keep_open } = options;

    if (uri) {
      let url     = new URL(uri)
        , host    = url.origin
        , id      = url.pathname? url.pathname.substring(1) : undefined
        ;

      if (_.isUndefined(id)) {
        throw new Error('uri specified without entity id')
      }
    }

    let socket = Api
                  .open({ id, host, rows, columns, meta, keep_open })
                  .then((result = {}) => {
                    let { token } = result;

                    return Promise
                            .fromCallback((cb) => {
                              let socket = socket_io(host);
                              // let socket = socket_io(uri);

                              socket
                                .on('connect', () => {
                                  socket.emit('authenticate', { token });
                                })
                                .on('tailf_ready', () => {
                                  socket.tailf = result;
                                  cb(undefined, socket);
                                })
                                // .on('disconnect', () =>{
                                //   winston.info('disconnected');
                                // })
                                // .on('authenticated', () => {
                                //   winston.log(`authenticated`);
                                // })
                                .on('unauthorized', (msg) => {
                                  winston.error(`unauthorized`, msg);
                                  socket.disconnect(true);
                                  cb(new Error(`unauthorized`), socket);
                                });
                            })
                  });

    this.socket = () => socket;
  }

  uri() {
    return this
            .socket()
            .then((socket) => {
              let { id } = socket.tailf;

              return (new URL(`${id}`, socket.io.uri)).toString();
            });
  }

  pipe(proc, cb) {
    let stdout    = this.stream({ type : 'stdout', manual_end : true })
      , stderr    = this.stream({ type : 'stderr', manual_end : true })
      ;

    proc.stdout.pipe(stdout);
    proc.stderr.pipe(stderr);

    async.parallel([
        (cb) => { stdout.on('end', cb) }
      , (cb) => { stderr.on('end', cb) }
    ], (err) => {
      this
        .socket()
        .then((socket) => {
          return Promise
                  .fromCallback((cb) => socket.emit('end', { time, type }, cb))
                  .tap(() => {
                    socket.close();
                  });
        })
        .asCallback(cb);
    });
  }

  stream(options = {}) {
    let { type, manual_end } = options;

    let transform = (chunk, enc, cb) => {
      this
        .socket()
        .then((socket) => {
          let time = new Date().getTime();

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
      this
        .socket()
        .then((socket) => {
          let time = new Date().getTime();

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
