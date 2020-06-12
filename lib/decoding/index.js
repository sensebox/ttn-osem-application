'use strict';

/**
 * Provides a generic decoding interface into which multiple decoding profiles
 * may be hooked. Implemented profiles are
 * {@link module:decoding/lora-serialization|lora-serialization},
 * {@link module:decoding/sensebox_home|sensebox/home},
 * {@link module:decoding/debug|debug}
 * @module decoding
 * @license MIT
 */

const { validators: { transformAndValidateMeasurements }, json } = require('@sensebox/opensensemap-api-models').decoding;
const { createLogger } = require('../logging');

const profiles = {
  /* eslint-disable global-require */
  'debug': require('./debug'),
  'lora-serialization': require('./lora-serialization'),
  'sensebox/home': require('./sensebox_home')
};

const log = createLogger('decoder');

/**
 * Decodes a Buffer to an array of measurements according to a bufferTransformer
 * @private
 * @param {Buffer} buffer - the data to decode
 * @param {Array} bufferTransformer - defines how the data is transformed.
 *        Each element specifies a transformation for one measurement.
 * @example <caption>Interface of bufferTransformer elements</caption>
 * {
 *   bytes: Number,        // amount of bytes to consume for this measurement
 *   sensorId: String,     // corresponding sensor_id for this measurement
 *   transformer: Function // function that accepts an Array of bytes and
 *                         // returns the measurement value
 *   onResult: Function    // hook that recieves all decoded measurements
 *                         // once decoding has finished. may modify the
 *                         // measurement array.
 * }
 * @return {Array} decoded measurements
 */
const bufferToMeasurements = function bufferToMeasurements (buffer, bufferTransformer) {
  const results = [];
  const warnings = [];
  let maskLength = 0, currByte = 0;

  // check mask- & buffer-length
  for (const mask of bufferTransformer) {
    maskLength = maskLength + mask.bytes;
  }

  if (maskLength !== buffer.length) {
    warnings.push(`incorrect amount of bytes: got ${buffer.length}, should be ${maskLength}`);
  }

  // feed each bufferTransformer element
  for (const mask of bufferTransformer) {
    const maskedBytes = buffer.slice(currByte, currByte + mask.bytes);

    if (maskedBytes.length !== 0) {
      results.push({
        sensor_id: mask.sensorId,
        value: mask.transformer(maskedBytes)
      });

      currByte = currByte + mask.bytes;
    }
  }

  // apply onResult hook from bufferTransformer elements
  for (const mask of bufferTransformer) {
    if (typeof mask.onResult === 'function') {
      mask.onResult(results);
    }
  }

  return { results, warnings };
};

/**
 * Transforms a buffer to a validated set of measurements according to a boxes
 * TTN configuration.
 * @param {Buffer} buffer - The data to be decoded
 * @param {Box} box - A box from the DB for lookup of TTN config & sensors
 * @param {String} [timestamp=new Date()] - Timestamp to attach to the measurements.
 * @return {Promise} Once fulfilled returns a validated array of measurements
 *         (no actual async ops are happening)
 */
const decodeBuffer = function decodeBuffer (buffer, box, timestamp) {
  return Promise.resolve().then(function () {
    // should never be thrown, as we find a box by it's ttn config
    if (!buffer.length) {
      throw new Error('payload may not be empty');
    }

    if (!box.integrations || !box.integrations.ttn) {
      throw new Error('box has no TTN configuration');
    }

    // select bufferTransformer according to profile
    const profile = profiles[box.integrations.ttn.profile];

    if (!profile) {
      throw new Error(`profile '${box.integrations.ttn.profile}' is not supported`);
    }

    const bufferTransformer = profile.createBufferTransformer(box);

    // decode buffer using bufferTransformer
    const { results, warnings } = bufferToMeasurements(buffer, bufferTransformer);

    // if a timestamp is provided, set it for all the measurements
    if (timestamp) {
      for (const m of results) {
        m.createdAt = m.createdAt || timestamp;
      }
    }

    // validate decoded measurements
    return transformAndValidateMeasurements(results).then((data) => {
      return { data, warnings };
    });
  });
};

/**
 * proxy for decodeBuffer, which converts the input data from base64 to a buffer first
 * @see module:decoding~decodeBuffer
 * @param {String} base64String
 * @param {Box} box
 * @param {String} [timestamp=new Date()]
 * @return {Promise} Once fulfilled returns a validated array of measurements
 *         (no actual async ops are happening)
 */
const decodeBase64 = function decodeBase64 (base64String, box, timestamp) {
  const buf = Buffer.from(base64String || '', 'base64');

  return decodeBuffer(buf, box, timestamp);
};

/**
 * decodes multiple json encoded measurements and validates them.
 * accepts either an measurement array, or an object like
 *     {"sensorId": [value, time, location]}
 * refer to {@link https://docs.opensensemap.org/#api-Measurements-postNewMeasurements|oSeM docs}
 * for specific input formats.
 * @param {Object} data
 * @return {Promise} Once fulfilled returns a validated array of measurements
 */
const decodeJSON = json.decodeMessage;

/**
 * decodes the request payload in `req.body` to validated measurements,
 * selects the decoder from `req.box` and applies `req.time`
 * @see module:decoding~decodeBuffer
 * @param {Request} req
 * @return {Promise} Once fulfilled returns a validated array of measurements
 */
const decodeRequest = function decodeRequest (req) {
  // extract time from payload: if available use time from
  // gateway, else use TTN API time, else use local request time
  let time = req.time.toISOString();
  let timeSource = 'local';
  if (req.body.metadata) {
    time = req.body.metadata.time;
    timeSource = 'TTN api';
    if (req.body.metadata.gateways && req.body.metadata.gateways[0].time) {
      time = req.body.metadata.gateways[0].time;
      timeSource = 'gateway';
    }
  }

  log.trace(`using ${timeSource} time & ${req.box.integrations.ttn.profile} decoder`);

  if (req.box.integrations.ttn.profile === 'json') {
    if (req.body.payload_fields) {
      return decodeJSON(req.body.payload_fields)
        .then(data => {
          return { data };
        });
    }

    return Promise.reject('no payload for profile `json` provided');
  }

  return decodeBase64(req.body.payload_raw, req.box, time);
};

module.exports = {
  decodeBuffer,
  decodeBase64,
  decodeJSON,
  decodeRequest
};
