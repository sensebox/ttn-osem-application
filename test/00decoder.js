'use strict';

/* eslint-env mocha */

// chakram breaks chai somehow, so chai tests have to run before chakram tests

const chai = require('chai'),
  expect = chai.expect;

chai.use(require('chai-things'));
chai.use(require('chai-as-promised'));

const decoder = require('../lib/decoding'),
  { validators: { transformAndValidateMeasurements } } = require('@sensebox/opensensemap-api-models').decoding,
  referenceImpl = require('./data/decoderReferenceImplementation'),

  // test data
  payloadDebug = require('./data/TTNpayload_debug_valid.json'),
  payloadSbhome = require('./data/TTNpayload_sbhome_valid.json'),
  payloadLoraserialization = require('./data/TTNpayload_loraserialization_valid.json'),
  payloadLoraserialization2 = require('./data/TTNpayload_loraserialization_advanced.json'),
  boxDebug = require('./data/ttnBox_debug.json'),
  boxSbhome = require('./data/ttnBox_sbhome.json'),
  boxLoraserialization = require('./data/ttnBox_loraserialization.json'),
  boxLoraserialization2 = require('./data/ttnBox_loraserialization_advanced.json'),

  profiles = {
    debug: {
      box: JSON.parse(JSON.stringify(boxDebug)),
      payloads: {
        buffer: Buffer.from(payloadDebug.payload_raw, 'base64'),
        base64: payloadDebug.payload_raw
      },
      results: { buffer: null, base64: null }
    },

    sbhome: {
      box: JSON.parse(JSON.stringify(boxSbhome)),
      payloads: {
        buffer: Buffer.from(payloadSbhome.payload_raw, 'base64'),
        base64: payloadSbhome.payload_raw
      },
      results: { buffer: null, base64: null, reference: null }
    },

    loraserialization: {
      box: JSON.parse(JSON.stringify(boxLoraserialization)),
      box2: JSON.parse(JSON.stringify(boxLoraserialization2)),
      payloads: {
        buffer: Buffer.from(payloadLoraserialization.payload_raw, 'base64'),
        base64: payloadLoraserialization.payload_raw
      },
      results: { buffer: null, base64: null }
    },

    loraserialization2: {
      box: JSON.parse(JSON.stringify(boxLoraserialization2)),
      payloads: { base64: payloadLoraserialization2.payload_raw },
      results: { buffer: null, base64: null }
    }
  };

describe('decoder', () => {

  before(() => {
    // run all the decodings once
    return Promise.all([
      // profile debug
      decoder.decodeBuffer(profiles.debug.payloads.buffer, profiles.debug.box),
      decoder.decodeBase64(profiles.debug.payloads.base64, profiles.debug.box),
      // profile sbhome
      decoder.decodeBuffer(profiles.sbhome.payloads.buffer, profiles.sbhome.box),
      decoder.decodeBase64(profiles.sbhome.payloads.base64, profiles.sbhome.box),
      transformAndValidateMeasurements(referenceImpl(profiles.sbhome.payloads.buffer, {
        temperature: profiles.sbhome.box.sensors[4]._id,
        humidity: profiles.sbhome.box.sensors[3]._id,
        pressure: profiles.sbhome.box.sensors[2]._id,
        lightintensity: profiles.sbhome.box.sensors[1]._id,
        uvlight: profiles.sbhome.box.sensors[0]._id
      })),
      // profile loraserialization
      decoder.decodeBuffer(profiles.loraserialization.payloads.buffer, profiles.loraserialization.box),
      decoder.decodeBase64(profiles.loraserialization.payloads.base64, profiles.loraserialization.box),
      decoder.decodeBase64(profiles.loraserialization2.payloads.base64, profiles.loraserialization2.box),
    ])
      .then(decodings => {
        // clean up result invariants
        for (let i = 0; i < decodings.length; i++) {
          if (i === 7) {continue;}
          if (i === 4) {
            decodings[4].map(m => { delete m._id; delete m.createdAt; });
            continue;
          }
          decodings[i].data.map(m => { delete m._id; delete m.createdAt; });
        }

        profiles.debug.results.buffer = decodings[0].data;
        profiles.debug.results.base64 = decodings[1].data;
        profiles.sbhome.results.buffer = decodings[2].data;
        profiles.sbhome.results.base64 = decodings[3].data;
        profiles.sbhome.results.reference = decodings[4];
        profiles.loraserialization.results.buffer = decodings[5].data;
        profiles.loraserialization.results.base64 = decodings[6].data;
        profiles.loraserialization2.results.base64 = decodings[7].data;
      });
  });

  it('should return error for missing TTN config', () => {
    return expect(decoder.decodeBuffer(Buffer.from('asdf', 'base64'), {}))
      .to.be.rejectedWith('box has no TTN configuration');
  });

  it('should reject unknown profiles', () => {
    return expect(decoder.decodeBuffer(Buffer.from('asdf', 'base64'), {
      integrations: { ttn: { profile: ':^)' } }
    })).to.be.rejectedWith('profile \':^)\' is not supported');
  });

  it('should return error for empty buffer payload', () => {
    return expect(decoder.decodeBuffer(new Buffer([]), profiles.debug.box))
      .to.be.rejectedWith('payload may not be empty');
  });

  it('should return error for empty base64 payload', () => {
    return expect(decoder.decodeBase64('', profiles.debug.box))
      .to.be.rejectedWith('payload may not be empty');
  });

  it('set createdAt if timestamp is provided', () => {
    const p = profiles.debug,
      time = new Date('2017-01-01T02:03:04').toISOString();

    return decoder.decodeBase64(p.payloads.base64, p.box, time)
      .then(({ data }) => {
        for (const m of data) {
          expect(m.createdAt.valueOf()).to.equal(new Date(time).getTime());
        }
      });
  });

  describe('profile: debug', () => {

    const p = profiles.debug;

    it('should return a valid measurement array', () => {
      return expect(p.results.buffer)
        .to.be.an('array').with.lengthOf(3)
        .with.all.have.property('sensor_id')
        .with.all.have.property('value')
        .and.contains.one.with.property('value', 1)
        .and.contains.one.with.property('value', 2)
        .and.contains.one.with.property('value', 3);
    });

    it('should return the same for base64 input', () => {
      return expect(p.results.base64).to.deep.equal(p.results.buffer);
    });

    it('should reject a box too long byteMask', () => {
      p.box.sensors.pop();
      p.box.sensors.pop();
      p.box.sensors.pop();

      return expect(decoder.decodeBase64(p.payloads.base64, p.box))
        .to.be.rejectedWith('box requires at least 3 sensors');
    });

    it('should reject a box with missing byteMask', () => {
      delete p.box.integrations.ttn.decodeOptions;

      return expect(decoder.decodeBase64(p.payloads.base64, p.box))
        .to.be.rejectedWith('profile \'debug\' requires a valid byteMask');
    });
  });


  describe('profile: sensebox/home', () => {

    const p = profiles.sbhome;

    it('should return a valid measurement array', () => {
      return expect(p.results.buffer).to.be.an('array').with.lengthOf(5)
        .with.all.have.property('sensor_id')
        .with.all.have.property('value');
    });

    it('should return same results as reference implementation', () => {
      return expect(p.results.buffer).to.deep.equal(p.results.reference);
    });

    it('should decode base64 to measurements with same result', () => {
      return expect(p.results.base64).to.deep.equal(p.results.buffer);
    });

    it('should return a response include a warning with incorrect amout of bytes', () => {
      return decoder.decodeBuffer(Buffer.from('adfc', 'hex'), p.box)
        .then(function (data) {
          expect(data.warnings).to.be.an('array')
            .contains('incorrect amount of bytes: got 2, should be 12');
        });
    });
  });


  describe('profile: lora-serialization', () => {

    const p = profiles.loraserialization;
    const p2 = profiles.loraserialization2;

    it('should return a valid measurement array', () => {
      expect(p.results.buffer)
        .to.be.an('array').with.lengthOf(3)
        .with.all.have.property('sensor_id')
        .and.contains.one.with.property('sensor_id', '588876b67dd004f79259bd8e')
        .and.contains.one.with.property('value', -5.3)
        .and.contains.one.with.property('sensor_id', '588876b67dd004f79259bd8d')
        .and.contains.one.with.property('value', 78.7)
        .and.contains.one.with.property('sensor_id', '588876b67dd004f79259bd8a')
        .and.contains.one.with.property('value', 666);
    });

    it('should return the same for base64 input', () => {
      expect(p.results.base64).to.deep.equal(p.results.buffer);
    });

    it('should use unixtime decoder for timestamps', () => {
      p.box.integrations.ttn.decodeOptions.unshift({ decoder: 'unixtime' });

      return decoder.decodeBase64('D4zuWP3uvh6aAg==', p.box).then(data => {
        expect(data.data).to.be.an('array').with.lengthOf(3);
        for (const m of data.data) {
          expect(m.createdAt.valueOf())
            .to.equal(new Date('2017-04-12T20:20:31.000Z').getTime());
        }
      });
    });

    it('should use latLng decoder for locations', () => {
      p.box.integrations.ttn.decodeOptions.unshift({ decoder: 'latLng' });

      return decoder.decodeBase64('pOUYA+Q8dQAPjO5Y/e6+HpoC', p.box).then(data => {
        expect(data.data).to.be.an('array').with.lengthOf(3);
        for (const m of data.data) {
          expect(m.createdAt.valueOf())
            .to.equal(new Date('2017-04-12T20:20:31.000Z').getTime());
          expect(m.location[0]).to.equal(7.6833);
          expect(m.location[1]).to.equal(51.9633);
        }
      });
    });

    it('should support multiple measurements per sensor in one payload', () => {
      return expect(p2.results.base64)
        .to.be.an('array').with.lengthOf(3)
        .with.all.have.property('sensor_id', '588876b67dd004f79259bd8e')
        .with.all.have.property('value')
        .and.contains.one.with.property('value', -11.3)
        .and.contains.one.with.property('value', 23.45)
        .and.contains.one.with.property('value', 34.5);
    });

    it('should apply special decoders only to measures following it', () => {
      expect(p2.results.base64[0].createdAt.valueOf())
        .to.equal(new Date('2017-04-12T20:20:31.000Z').getTime());
      expect(p2.results.base64[0].location[0]).to.equal(7.6833);
      expect(p2.results.base64[0].location[1]).to.equal(51.9633);

      expect(p2.results.base64[1].createdAt.valueOf())
        .to.equal(new Date('2017-04-20T20:20:31.000Z').getTime());
      expect(p2.results.base64[1].location[0]).to.equal(8);
      expect(p2.results.base64[1].location[1]).to.equal(52);

      // this is the first measurement in the payload, but returned
      // measurements are ordered by date
      const timeDiff = new Date().getTime() - p2.results.base64[2].createdAt.valueOf();
      expect(timeDiff).to.be.lessThan(1000);
      expect(p2.results.base64[2].location).to.be.undefined;
    });

    it('should reject a box with invalid transformers', () => {
      p.box.integrations.ttn.decodeOptions.push({
        sensor_id: p.box.sensors[2]._id.toString(), decoder: 'decode'
      });

      return expect(decoder.decodeBase64(p.payloads.base64, p.box))
        .to.be.rejectedWith('\'decode\' is not a supported transformer');
    });

    it('should return error for incomplete sensors', () => {
      p.box.sensors.pop();

      return expect(decoder.decodeBuffer(p.payloads.buffer, p.box))
        .to.be.rejectedWith('box does not contain sensors mentioned in byteMask');
    });

    it('should reject a box with invalid decodeOptions', () => {
      p.box.integrations.ttn.decodeOptions.map(el => {
        delete el.sensor_id;

        return el;
      });

      return expect(decoder.decodeBase64(p.payloads.base64, p.box))
        .to.be.rejectedWith('invalid decodeOptions. requires at least one of [sensor_id, sensor_title, sensor_type]');
    });

    it('should reject a box with missing byteMask', () => {
      delete p.box.integrations.ttn.decodeOptions;

      return expect(decoder.decodeBase64(p.payloads.base64, p.box))
        .to.be.rejectedWith('profile \'lora-serialization\' requires valid decodeOptions');
    });

  });
});
