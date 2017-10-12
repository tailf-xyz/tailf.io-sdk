var Promise             = require('bluebird')
  , _                   = require('lodash')
  , fetch               = require('isomorphic-fetch')
  , urljoin             = require('url-join')
  ;

function open(options = {}) {
  let { rows, columns, meta, id, host = 'https://tailf.io' } = options;

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
      , body    :  JSON.stringify({ rows, columns, meta })
    });
  }

  return Promise
          .resolve(fetch(uri, opts))
          .then((response) => {
            if (response.status >= 400) {
              // todo [akamel] better error message
              throw new Error('Bad response from server');
            }

            return response.json();
          })
}

function end(id, options = {}) {

}

module.exports = {
    open
  , end
};
