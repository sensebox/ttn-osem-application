'use strict';

const bunyan = require('bunyan');
const config = require('config');

const logger = bunyan.createLogger({
  name: 'ttn-osem-integration',
  level: config.loglevel,
  serializers: {
    req: bunyan.stdSerializers.req,
    res: bunyan.stdSerializers.res,
    err: bunyan.stdSerializers.err,
  }
});

/**
 * Creates a bunyan logger that inherits some global settings
 * @private
 * @param {string} component name for the logger, stored in the logfield `component`
 * @param {*} options bunyan options to be passed to the logger
 */
const createLogger = function createLogger (component, options) {
  return logger.child(Object.assign({ component }, options));
};

module.exports = {
  createLogger,
};
