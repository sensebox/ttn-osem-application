'use strict';

/* eslint-env mocha */

const chakram = require('chakram'),
  expect = chakram.expect;

//const app = require('../index'); // running server does not handle `mocha -w` well
const cfg = require('config');

// test data
const BASE_URL = `http://localhost:${cfg.port}`;

describe('server runs', () => {

  it('should send list of available routes with 404', () => {
    return chakram.get(BASE_URL).then(res => {
      expect(res).to.have.status(404);
      expect(res.body).to.have.contain('Available routes:');

      return chakram.wait();
    });
  });

  // TODO: check for existence of headers

});
