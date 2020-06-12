'use strict';

/* eslint-env mocha */

const chakram = require('chakram'),
  expect = chakram.expect;

chakram.addRawPlugin('one', require('chai-things'));

const cfg = require('config'),
  { db: { connect, mongoose }, Box, Measurement } = require('@sensebox/opensensemap-api-models');

// test data
const BASE_URL = `http://localhost:${cfg.port}`,
  box_sbhome = require('./data/ttnBox_sbhome.json'),
  box_json = require('./data/ttnBox_json.json'),
  TTNpayload_sbhome_valid = require('./data/TTNpayload_sbhome_valid.json'),
  TTNpayload_sbhome_nonexistent = require('./data/TTNpayload_sbhome_nonexistent.json'),
  TTNpayload_json_valid = require('./data/TTNpayload_json_valid.json');


describe('TTN HTTP Integration v1.1 webhook', () => {

  describe('POST /', () => {
    const URL = `${BASE_URL}/v1.1`;
    let measurementCountBefore;

    const removeBox = function removeBox (dev_id) {
      return Box.findOne({ 'integrations.ttn.dev_id': dev_id })
        .then(function (box) {
          return box ? box.removeSelfAndMeasurements() : Promise.resolve();
        });
    };

    before(function (done) {
      this.timeout(10000);

      // wait for DB connection
      mongoose.set('debug', false);
      connect()
        // delete all testboxes
        .then(() => Promise.all([
          removeBox(TTNpayload_sbhome_nonexistent.dev_id),
          removeBox(TTNpayload_sbhome_valid.dev_id),
          removeBox(TTNpayload_json_valid.dev_id)
        ]))
        // reinsert testboxes
        .then(() => Box.initNew(box_sbhome))
        .then(() => Box.initNew(box_json))
        // get initial count of measurements and set payload
        // dynamically, as we need the sensorId and a recent date!
        .then((jsonbox) => {
          TTNpayload_json_valid.payload_fields[jsonbox.sensors[0]._id] = 55.5;

          return Measurement.count({});
        })
        .then(count => {
          measurementCountBefore = count;
          done();
        });
    });

    it('should exist', () => {
      return chakram.post(URL).then(res => {
        expect(res).to.have.not.status(404);

        return chakram.wait();
      });
    });

    it('should respond 422 for empty request payloads', () => {
      return chakram.post(URL, {}).then(res => {
        expect(res).to.have.status(422);

        return chakram.wait();
      });

    });

    it('should respond 404 for nonexistent boxes', () => {
      return chakram.post(URL, TTNpayload_sbhome_nonexistent).then(res => {
        expect(res).to.have.status(404);

        return chakram.wait();
      });
    });

    it('should respond 201 for valid request payload_raw', () => {
      return chakram.post(URL, TTNpayload_sbhome_valid).then(res => {
        expect(res).to.have.status(201);

        return chakram.wait();
      });
    });

    it('set createdAt to local time if no metadata is provided', () => {
      return Measurement.find({ sensor_id: box_sbhome.sensors[0]._id }).then(measurements => {
        const timeDiff = Date.now() - measurements[0].createdAt.getTime();
        expect(timeDiff).to.be.below(200);

        return chakram.wait();
      });
    });

    it('set createdAt to TTN time if available', () => {
      const time = new Date(Date.now() + 20 * 1000);
      TTNpayload_sbhome_valid.metadata = { time: time.toISOString() };

      return chakram.post(URL, TTNpayload_sbhome_valid)
        .then(() => Measurement.find({ sensor_id: box_sbhome.sensors[0]._id }))
        .then(measurements => {
          const timeSet = measurements.some(m => time.getTime() === m.createdAt.getTime());
          expect(timeSet).to.equal(true);

          return chakram.wait();
        });
    });

    it('set createdAt to gateway time if available', () => {
      const time = new Date(Date.now() + 40 * 1000);
      TTNpayload_sbhome_valid.metadata.gateways = [{
        time: time.toISOString()
      }];

      return chakram.post(URL, TTNpayload_sbhome_valid)
        .then(() => Measurement.find({ sensor_id: box_sbhome.sensors[0]._id }))
        .then(measurements => {
          const timeSet = measurements.some(m => time.getTime() === m.createdAt.getTime());
          expect(timeSet).to.equal(true);

          return chakram.wait();
        });
    });

    it('should respond 201 for request payload_raw with less amount of bytes and should have a warning', () => {
      TTNpayload_sbhome_valid.payload_raw = 'asdf';

      return chakram.post(URL, TTNpayload_sbhome_valid).then(res => {
        expect(res).to.have.status(201);
        expect(res.body).to.include.keys('warnings');
        expect(res.body.warnings[0]).to.eql('incorrect amount of bytes: got 3, should be 12');

        return chakram.wait();
      });
    });

    it('should respond 404 for box filtered by port', () => {
      TTNpayload_sbhome_valid.port = 1234;

      return chakram.post(URL, TTNpayload_sbhome_valid).then(res => {
        expect(res).to.have.status(404);

        return chakram.wait();
      });
    });

    it('should respond 201 for valid request payload_fields', () => {
      return chakram.post(URL, TTNpayload_json_valid).then(res => {
        expect(res).to.have.status(201);

        return chakram.wait();
      });
    });

    it('should only parse `payload_fields` when profile `json` is specified', () => {
      TTNpayload_json_valid.dev_id = 'my-dev-id'; // change to box with sensebox/home profile

      return chakram.post(URL, TTNpayload_json_valid).then(res => {
        expect(res).to.have.status(201);
        expect(res.body).to.include.keys('warnings');
        expect(res.body.warnings[0]).to.eql('incorrect amount of bytes: got 3, should be 12');
        TTNpayload_json_valid.dev_id = 'jsonttnbox';

        return chakram.wait();
      });
    });

    it('should respond 422 for invalid request payload_fields', () => {
      delete TTNpayload_json_valid.payload_fields;

      return chakram.post(URL, TTNpayload_json_valid).then(res => {
        expect(res).to.have.status(422);

        return chakram.wait();
      });
    });

    it('should add measurements to the database', () => {
      return Measurement.count({}).then(countAfter => {
        expect(countAfter).to.equal(measurementCountBefore + 20); // 3*5 sbhome + 5 json

        return chakram.wait();
      });
    });
  });

});
