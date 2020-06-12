'use strict';

const express = require('express'),
  bodyParser = require('body-parser'),
  server = express(),
  { db: { connect, mongoose } } = require('@sensebox/opensensemap-api-models'),
  config = require('config'),
  { createLogger } = require('./logging'),
  v11Router = require('./routes/v1.1');

const log = createLogger('server');

server.use(function reqLogger (req, res, next) {
  req.time = new Date();
  log.debug({ req }, `${req.method} ${req.url} from ${req.ip}`);
  next();
});

server.use(bodyParser.json());

// major version: TTN HTTP API version
// minor version: version of this API
server.use('/v1.1', v11Router);

const msg = `404 Not Found. Available routes:

POST  /v1.1    webhook for messages from the TTN HTTP Integration
               payload format: https://www.thethingsnetwork.org/docs/applications/http/
`;

server.use(function notFoundHandler (req, res, next) {
  if (!res || res.finished !== true) {
    res
      .status(404)
      .type('txt')
      .send(msg);
  }
  next();
});

// launch server once connected to DB
mongoose.set('debug', false);
connect().then(function onDBConnection () {
  server.listen(config.port, (err) => {
    if (!err) {
      log.info(`server listening on port ${config.port}`);
    } else {
      log.error(err);
    }
  });
});
