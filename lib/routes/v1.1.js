'use strict';

/**
 * Router for TTN HTTP integrations API v1 and this API v1
 * @module routes/v1_1
 * @license MIT
 */

const router = require('express').Router(),
  { Box } = require('@sensebox/opensensemap-api-models'),
  decoder = require('../decoding'),
  { createLogger } = require('../logging');

/**
 * express middleware, sending responses & compute reponse time
 *
 * expects res.local to contain { code, data } or an Error
 * expects req.time to be a Date
 * @private
 */
const sendResponse = function sendResponse (req, res, next) {
  let data = res.locals;

  // handle undhandled errors
  if (!data.code) {
    data = { code: 501, msg: data };
  }

  data.msg = data.msg.toString();

  res.status(data.code).json(data);
  res.locals.responseTime = Date.now() - req.time.getTime();

  next();
};

const log = createLogger('webhook-v1.1', {
  serializers: {
    box (box) {
      return box
        ? { id: box._id, sensors: box.sensors, ttn: box.integrations.ttn }
        : {};
    },
    res (res) {
      const { msg, responseTime, code } = res.locals;

      return { msg, responseTime, code };
    },
  },
});

/**
 * express middleware, logging result of a webhook request
 * @private
 */
const logResponse = function logResponse (req, res, next) {
  const { msg, responseTime, code } = res.locals;
  const message = `${code} (${responseTime}ms): ${msg}`;
  if (code >= 500) {
    log.error({ res }, message);
  } else if (code >= 400) {
    log.warn({ res, box: req.box, payload: req.body }, message);
  } else {
    log.info({ res }, message);
  }
  next();
};

/**
 * Accepts a POST request from the TTN HTTP integrations uplink API, version 1
 * as specified {@link https://www.thethingsnetwork.org/docs/applications/http/|here},
 * and decodes it's payload to store a set of measurements for a box.
 * The box is identified by it's registered values app_id and dev_id.
 * If a box specifies a port, it will only recieve measurements sent on that port.
 * @name 'POST /v1.1'
 * @example
 * curl -X POST -H "content-type: application/json" -d \
 *   '{ "app_id": "asdf", "dev_id": "qwerty", "payload_raw": "kzIrIYzlOycAMgEA" }' \
 *   localhost:3000/v1.1
 */
const httpIntegrationHandler = function httpIntegrationHandler (req, res, next) {
  const { app_id, dev_id, payload_raw, payload_fields, port } = req.body;

  log.debug({ payload: req.body }, 'payload');

  if (
    !dev_id ||
    !app_id ||
    !(payload_raw || payload_fields)
  ) {
    Object.assign(res.locals, {
      code: 422,
      msg: 'malformed request: any of [dev_id, app_id, payload_fields, payload_raw] is missing'
    });

    return next();
  }

  // Populate lastMeasurement on box
  const BOX_SUB_PROPS_FOR_POPULATION = [
    {
      path: 'sensors.lastMeasurement', select: { value: 1, createdAt: 1, _id: 0 }
    },
  ];

  // look up box for dev_id & app_id in DB
  Box.find({
    'integrations.ttn.app_id': app_id,
    'integrations.ttn.dev_id': dev_id
  }).populate(BOX_SUB_PROPS_FOR_POPULATION)
    .catch(msg => Promise.reject({ code: 501, msg }))
    .then(boxes => {
      if (!boxes.length) {
        return Promise.reject({ code: 404, msg: `no box found for dev_id '${dev_id}' and app_id '${app_id}'` });
      }

      // filter the boxes by their configured port. also include boxes with undefined port.
      req.box = boxes.filter(box => {
        const p = box.integrations.ttn.port;

        return (p === port || p === undefined || p === null);
      })[0];

      if (!req.box) {
        return Promise.reject({ code: 404, msg: `no box found for port ${port}` });
      }

      log.debug({ box: req.box }, 'matched box');

      // decode measurements from request.body, req.box & req.time
      return decoder.decodeRequest(req)
        .catch(msg => Promise.reject({ code: 422, msg }));
    })

    // store measurements in DB
    .then(({ data, warnings }) => {
      log.debug({ data }, 'resulting measurements');

      Object.assign(res.locals, { warnings });

      return req.box.saveMeasurementsArray(data)
        .catch(msg => Promise.reject({ code: 422, msg }));
    })

    .then(() => {
      Object.assign(res.locals, { code: 201, msg: 'measurements created' });

      return next();
    })

    // handle any error passed in
    .catch(err => {
      res.locals = err;

      return next();
    });
};

router.post('/', [
  httpIntegrationHandler,
  sendResponse,
  logResponse,
]);

module.exports = router;
