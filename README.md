# ttn-osem-integration

Microservice for [openSenseMap](https://opensensemap.org) that provides a
direct integration with [TheThingsNetwork](https://thethingsnetwork.org)
to allow straightforward measurement upload from LoRa-WAN devices.

It decodes measurements from an uplink payload from the [TTN HTTP Integrations API](https://www.thethingsnetwork.org/docs/applications/http/)
for a configured senseBox, and adds the decoded measurements to the database.

There are multiple decoding options provided via `profiles`, which may be
easily extended to support other sensor configurations or value transformations.

## configuring a box
To associate a device on TTN with a box on the openSenseMap, there is some
configuration required on the openSenseMap. The box has to contain a field
`box.integrations.ttn` with the following structure:
```js
ttn: {
  // the app_id & dev_id you recieved when registering on TTN
  app_id: 'abcd',
  dev_id: '1234',
  // decode the messages according to this profile format, see below
  profile: 'lora-serialization',
  // optional. some profiles require additional configuration
  decodeOptions: [],
  // optional. if specified, only messages recieved on this LoRa-port are stored
  port: 3,
}
```

### decoding profiles
#### `sensebox/home`
Decodes messages of all sensors of the senseBox:home. Takes registered sensors into account and decodes payload accordingly. Therefore, the senseBox:home lora sketch should not be changed except TTN IDs.
The correct sensorIds are matched via their titles. Decoding fits the [senseBox:home lora sketch](https://github.com/sensebox/node-sketch-templater/blob/master/templates/homev2_lora.tpl).

#### `lora-serialization`
Allows decoding of messages that were encoded with the [`lora-serialization` library](https://github.com/thesolarnomad/lora-serialization).
The decoders `temperature`, `humidity`, `uint8`, `uint16`, `unixtime` and `latLng` are supported.
Each encoded value is matched to a sensor via it's `_id`, `sensorType`, `unit`, or `title` properties.
There may be one or more property defined for each value via `sensor_id`, `sensor_title`, `sensor_type`, `sensor_unit`.
If one property matches a sensor, the other properties are discarded.

The following example config allows decoding of measurements of 3 sensors:
```js
"ttn": {
  "profile": "lora-serialization",
  "decodeOptions": [
    { "decoder": "temperature", "sensor_unit": "°C" },
    { "decoder": "humidity", "sensor_id": "588876b67dd004f79259bd8b" },
    { "decoder": "uint16", "sensor_type": "TSL45315", "sensor_title": "Beleuchtungsstärke" }
  ]
}
```

##### special decoders `unixtime` & `latLng`
These decoders do not generate a measurement for a sensor of the box, but will
be used as **timestamp** or **location** for the measurements.
The `unixtime` and `latLng` decoders must be defined before the measurements,
and are applied to all following measurements, until the next `latLng` or
`unixtime` decoder is specified.
This means that it is possible to send measurements of several timestamps at once:
```js
"ttn": {
  "profile": "lora-serialization",
  "decodeOptions": [
    // first measurement, will have time of transmission as timestamp
    { "decoder": "temperature", "sensor_unit": "°C" },
    // 2nd measurement for same sensor, will have custom timestamp
    { "decoder": "unixtime" }, // no sensor properties required for special decoders
    { "decoder": "temperature", "sensor_unit": "°C" },
    // 3rd measurement, another timestamp
    { "decoder": "unixtime" },
    { "decoder": "temperature", "sensor_unit": "°C" }
  ]
}
```

#### `debug`
Simple decoder, which decodes a given number of bytes to integer values.
Requires a config like the following, where the measurements are applied to the sensors in the order of `box.sensors`.
```js
ttn: {
  profile: 'lora-serialization',
  decodeOptions: [3, 1, 2] // specifies the number of bytes to consume for each measurement
}
```

#### `json`
It's also possible to add measurements which already have been decoded by a [TTN payload function](https://www.thethingsnetwork.org/docs/devices/uno/quick-start.html#monitor--decode-messages).
The property `payload_fields` has to contain JSON in the [format accepted by the openSenseMap-API](https://docs.opensensemap.org/#api-Measurements-postNewMeasurements).
This is the case, if the TTN application has a *Payload Function* defined.

## deployment
There is a `Dockerfile`, as well as an `docker-compose.yml` which includes a mongodb instance.
If you want to run the application directly, you need to have the dependencies listed below installed.
For configuration, see below. Once configured, run
```bash
yarn install
npm start
```

### dependencies
- `node.js >= 6.x`
- `yarn`
- `mongodb >= 3.x`

### configuration
Configuration is handled by [node-config]. See [config/default.json](config/default.json).
```json
{
  "port": 3000,
  "loglevel": "trace",
  "openSenseMap-API-models": {
    "db": {
      // See example config json of @sensebox/opensensemap-api-models
      "mongo_uri"
    }
  }
}
```

## development
- JSDoc documentation can be found under `./docs/` or [sensebox.github.io/ttn-osem-integration](https://sensebox.github.io/ttn-osem-integration). To update it, run `npm run docs`.
- To run the test suite, either run `npm run test` while the application is running, or `./run_tests.sh` (requires bash & docker).
- Please follow the existing code style. Double check by running `npm run lint`.

## license
MIT, see [`LICENSE`](LICENSE)

[node-config]: https://github.com/lorenwest/node-config
