'use strict';

var socket_io     = require('socket.io-client')
  , Promise       = require('bluebird')
  , EventEmitter  = require('events')
  , { URL }       = require('universal-url')
  ;

class Client extends EventEmitter {
  constructor(uri = 'https://tailf.io', options = {}) {
    super();

    let url       = new URL(uri)
      , id        = url.pathname.substring(1)
      , host      = url.origin
      , { token } = options
      ;

    Object.assign(this, { uri, id, host, token });

    let socket = socket_io(host);

    socket
      .on('authenticated', () => {
        socket.emit('authorize_read');
      })
      .on('readable', () => {
        // if (room) {
          socket.emit('join', { replay : true }, (res) => {
            //
          });
        // }
      })
      .on('chunk', this.on_chunk.bind(this))
      .on('end', this.on_end.bind(this))
      .on('unauthorized', (msg) => {
        // console.log('unauthorized: ' + JSON.stringify(msg.data));
        throw new Error(msg);
      })
      .emit('authenticate', { token })
      ;

    this.socket = socket;
  }

  // on_connect() {
  //   // let url = new URL(this.socket.io.uri);
  //
  //   // url.searchParams.set('room', this.socket.id);
  //
  //   this.emit('connect');
  // }

  on_chunk(payload = {}) {
    let { text, type }  = payload;

    switch(type) {
      case 'stdout':
        // console.log(text);
        // text = text;
      break;
      case 'stderr':
        // console.error(text);
        text = '\x1b[31m' + text + '\x1b[m';
      break;
    }

    if (text) {
      // this is required for xterm.js, to add \r when it is missing
      // todo [akamel] why is it missing from original source?
      text = text.replace(/\r?\n/g, '\r\n');
      this.emit('data', { text, type })
    }
  }

  on_end(payload = {}) {
    let { type } = payload;

    this.emit('end', { type })
  }

  close() {
    this.socket.close();
    this.removeAllListeners();
  }

  static connect(...arg) {
    return Promise
            .fromCallback((cb) => {
              let ret = new Client(...arg);

              // todo [akamel] this might never resolve
              ret.on('connect', () => { cb(undefined, ret); });
            });
  }
}

module.exports = Client;
