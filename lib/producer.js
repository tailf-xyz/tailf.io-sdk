'use strict';

var Promise       = require('bluebird')
  , winston       = require('winston')
  , _             = require('lodash')
  , { URL }       = require('universal-url')
  , EventEmitter  = require('events')
  , through2      = require('through2')
  , sink          = require('through2-sink')
  , timeout       = require('callback-timeout')
  , socket_io     = require('socket.io-client')
  ;

const TIMEOUT_MS_CHUNK  = 500
    , TIMEOUT_MS_END    = 5000
    ;

class Producer extends EventEmitter {
  constructor(options = {}) {
    super();

    let { id, host, rows, columns, meta } = options;

    let socket = Api
                  .open({ id, host, rows, columns, meta })
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

  stream(type = 'stdout') {
    let transform = (obj = {}, enc, cb) => {
      this
        .socket()
        .then((socket) => {
          let time      = new Date().getTime()
            , { chunk } = obj
            ;

          return Promise
                  .fromCallback((cb) => {
                    if (chunk) {
                      socket.emit('chunk', { time, type, chunk }, timeout((err) => { cb(null, obj); }, TIMEOUT_MS_CHUNK));
                    } else {
                      socket.emit('end', { time, type }, timeout((err) => {
                        socket.close();
                        cb(null, obj);
                      }, TIMEOUT_MS_END));
                    }
                  });
        })
        .catch((err) => {
          winston.error(err);
          throw err;
        })
        // .tap(() => {
        //   console.log('tapping')
        // })
        .asCallback(cb);
    };

    let flush = (cb) => {
      this
        .socket()
        .then((socket) => {
          let time = new Date().getTime();

          return Promise
                  .fromCallback((cb) => {
                    socket.emit('end', { time, type }, () => {
                      socket.close();
                      cb();
                    });
                  });
        })
        .catch((err) => {
          winston.error(err);
          throw err;
        })
        .asCallback(cb);
    };

    let ret = through2.obj(transform, flush);

    ret.pipe(sink.obj(() => {}));

    return ret;
  }
}

module.exports = Producer;
