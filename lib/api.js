var Promise             = require('bluebird')
  , _                   = require('lodash')
  , fetch               = require('isomorphic-fetch')
  , urljoin             = require('url-join')
  ;

function open(options = {}) {
  let { account, rows, columns, meta, id, host = 'https://tailf.io', keep_open } = options;

  let uri   = undefined
    , opts  = {}
    ;

  if (id) {
    uri = urljoin(host, 'api', 'log', id);

    Object.assign(opts, {
        method : 'GET'
    });
  } else {
    uri = urljoin(host, 'api', 'log');

    Object.assign(opts, {
        method  : 'PUT'
      , headers : { 'Content-Type': 'application/json' }
      , body    :  JSON.stringify({ account, rows, columns, meta, keep_open })
    });
  }

  return Promise
          .resolve(fetch(uri, opts))
          .then((response) => {
            if (response.status >= 400) {
              throw new Error(`http error ${response.status} for ${uri}`);
            }

            return response.json();
          });
}

function end(id, options = {}) {
  let { host = 'https://tailf.io', token = '' } = options;

  let uri     = urljoin(host, 'api', 'log', id, 'end')
    , headers = { 'Authorization' : `Bearer ${token}` }
    , opts    = { method : 'POST', headers }
    ;

  return Promise
          .resolve(fetch(uri, opts))
          .then((response) => {
            if (response.status >= 400) {
              throw new Error(`http error ${response.status} for ${uri}`);
            }

            return response.json();
          })
}

function patch(id, meta, options = {}) {
  let { host = 'https://tailf.io', token = '' } = options;

  let uri     = urljoin(host, 'api', 'log', id)
    , headers = { 'Authorization' : `Bearer ${token}` }
    , opts    = { method : 'PATCH', headers, body : { meta }, json : true }
    ;

  return Promise
          .resolve(fetch(uri, opts))
          .then((response) => {
            if (response.status >= 400) {
              throw new Error(`http error ${response.status} for ${uri}`);
            }

            return response.json();
          })
}

module.exports = {
    open
  , patch
  , end
};
