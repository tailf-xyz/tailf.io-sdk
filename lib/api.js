var Promise             = require('bluebird')
  , _                   = require('lodash')
  , fetch               = require('isomorphic-fetch')
  , urljoin             = require('url-join')
  , retry               = require('bluebird-retry')
  ;

function open(options = {}) {
  let { id, host = 'https://tailf.io', token } = options;

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

    // { account, rows, columns, meta, keep_open, rotate }
    let body = _.omit(options, ['id', 'host']);

    Object.assign(opts, {
        method  : 'PUT'
      , headers : { 'Content-Type': 'application/json' }
      , body    :  JSON.stringify(body)
    });
  }

  if (token) {
    opts.headers = _.extend(opts.headers, {
      authorization : `Bearer ${token}`
    });
  }

  return Promise
          .try(() => {
            return retry(() => {
              return fetch(uri, opts);
            }, { max_tries: 5, interval: 1000 });
          })
          .then((response) => {
            if (response.status >= 400) {
              throw new Error(`http error for ${uri}, code ${response.status}, error: ${response.statusText}`);
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
          .try(() => {
            return retry(() => {
              return fetch(uri, opts);
            }, { max_tries: 5, interval: 1000 });
          })
          .then((response) => {
            if (response.status >= 400) {
              throw new Error(`http error for ${uri}, code ${response.status}, error: ${response.statusText}`);
            }

            return response.json();
          })
}

function patch(id, meta, options = {}) {
  let { host = 'https://tailf.io', token = '' } = options;

  let uri     = urljoin(host, 'api', 'log', id)
    , headers = { 'Authorization' : `Bearer ${token}`, 'Content-Type': 'application/json' }
    , opts    = { method : 'PATCH', headers, body : JSON.stringify({ meta }) }
    ;

  return Promise
          .try(() => {
            return retry(() => {
              return fetch(uri, opts);
            }, { max_tries: 5, interval: 1000 });
          })
          .then((response) => {
            if (response.status >= 400) {
              throw new Error(`http error for ${uri}, code ${response.status}, error: ${response.statusText}`);
            }

            // return response.json();
          })
}

function read(id, options = {}) {
  let { host = 'https://tailf.io', token = '' } = options;

  let uri     = urljoin(host, 'api', 'log', id)
    , headers = { 'Authorization' : `Bearer ${token}` }
    , opts    = { method : 'GET', headers }
    ;

  return Promise
          .try(() => {
            return retry(() => {
              return fetch(uri, opts);
            }, { max_tries: 5, interval: 1000 });
          })
          .then((response) => {
            if (response.status >= 400) {
              throw new Error(`http error for ${uri}, code ${response.status}, error: ${response.statusText}`);
            }

            return response.json();
          })
}

module.exports = {
    open
  , read
  , patch
  , end
};
