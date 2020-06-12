'use strict';

/**
 * This decoding profile decodes the measurements for the sensors of the
 * senseBox:home (temperature, humidity, pressure, lightintensity, uvlight, pm10, pm2.5, soil temperature, soil moisture, sound level, bme680).
 * It applies value transformation fitting for {@link https://github.com/sensebox/node-sketch-templater/blob/master/templates/homev2_lora.tpl|this arduino sketch}.
 * @module decoding/sensebox_home
 * @license MIT
 */

const { bytesToInt, findSensorIds } = require('./helpers');

// alternative titles recognized for the sensors
const sensorMatchings = {
  temperature: {
    title: ['temperatur', 'temperature'],
  },
  humidity: {
    title: ['rel. luftfeuchte', 'luftfeuchtigkeit', 'humidity']
  },
  pressure: {
    title: ['luftdruck', 'druck', 'pressure', 'air pressure']
  },
  lightintensity: {
    title: ['licht', 'helligkeit', 'beleuchtungsstärke', 'einstrahlung', 'light', 'light intensity']
  },
  uvlight: {
    title: ['uv', 'uv-a', 'uv-intensität', 'uv-intensity']
  },
  pm10: {
    title: ['pm10', 'pm 10']
  },
  pm25: {
    title: ['pm2.5', 'pm 2.5']
  },
  soiltemperature: {
    title: ['soiltemperature', 'soil temperature', 'temperature soil', 'bodentemperatur', 'boden temperatur', 'temperatur boden']
  },
  soilmoisture: {
    title: ['soilmoisture', 'soil moisture', 'moisture soil', 'bodenfeuchte', 'boden feuchte', 'feuchte boden', 'bodenfeuchtigkeit', 'boden feuchtigkeit', 'feuchtigkeit boden']
  },
  soundlevel: {
    title: ['soundlevel', 'sound level', 'lautstärke', 'schallpegel', 'schall pegel']
  },
  bmetemperature: {
    title: ['lufttemperatur']
  },
  bmehumidity: {
    title: ['luftfeuchte']
  },
  bmepressure: {
    title: ['atm. luftdruck']
  },
  bmevoc: {
    title: ['VOC']
  },
  windspeed: {
    title: ['windgeschwindigkeit', 'wind weschwindigkeit', 'windspeed', 'wind speed']
  }
};

const transformers = {
  temperature: {
    bytes: 2,
    transformer: bytes => parseFloat((bytesToInt(bytes) / 771 - 18).toFixed(1))
  },
  humidity: {
    bytes: 2,
    transformer: bytes => parseFloat((bytesToInt(bytes) / 1e2).toFixed(1))
  },
  pressure: {
    bytes: 2,
    transformer: bytes => parseFloat((bytesToInt(bytes) / 81.9187 + 300).toFixed(1))
  },
  lightintensity: {
    bytes: 3,
    transformer (bytes) {
      const [mod, ...times] = bytes;

      return bytesToInt(times) * 255 + bytesToInt([mod]);
    }
  },
  uvlight: {
    bytes: 3,
    transformer (bytes) {
      const [mod, ...times] = bytes;

      return bytesToInt(times) * 255 + bytesToInt([mod]);
    }
  },
  pm10: {
    bytes: 2,
    transformer: bytes => parseFloat((bytesToInt(bytes) / 10).toFixed(1))
  },
  pm25: {
    bytes: 2,
    transformer: bytes => parseFloat((bytesToInt(bytes) / 10).toFixed(1))
  },
  soiltemperature: {
    bytes: 2,
    transformer: bytes => parseFloat((bytesToInt(bytes) / 771 - 18).toFixed(1))
  },
  soilmoisture: {
    bytes: 2,
    transformer: bytes => parseFloat((bytesToInt(bytes) / 1e2).toFixed(1))
  },
  soundlevel: {
    bytes: 2,
    transformer: bytes => parseFloat((bytesToInt(bytes) / 10).toFixed(1))
  },
  bmetemperature: {
    bytes: 2,
    transformer: bytes => parseFloat((bytesToInt(bytes) / 771 - 18).toFixed(1))
  },
  bmehumidity: {
    bytes: 2,
    transformer: bytes => parseFloat((bytesToInt(bytes) / 1e2).toFixed(1))
  },
  bmepressure: {
    bytes: 2,
    transformer: bytes => parseFloat((bytesToInt(bytes) / 81.9187 + 300).toFixed(1))
  },
  bmevoc: {
    bytes: 3,
    transformer (bytes) {
      const [mod, ...times] = bytes;

      return bytesToInt(times) * 255 + bytesToInt([mod]);
    }
  },
  windspeed: {
    bytes: 2,
    transformer: bytes => parseFloat((bytesToInt(bytes) / 10).toFixed(1))
  },
};

/**
 * returns a bufferTransfomer for transformation of a buffer to measurements.
 * @see module:decoding~bufferToMeasurements
 * @param {Box} box - The box to retrieve sensorIds from
 * @return {Array} A bufferTransformer for the box
 */
const createBufferTransformer = function createBufferTransformer (box) {
  const sensorMap = findSensorIds(box.sensors, sensorMatchings);

  const transformer = [];

  for (const key in sensorMap) {
    if (sensorMap.hasOwnProperty(key)) {
      transformer.push({
        sensorId: sensorMap[key],
        bytes: transformers[key].bytes,
        transformer: transformers[key].transformer
      });
    }
  }

  return transformer;
};

module.exports = {
  createBufferTransformer
};
