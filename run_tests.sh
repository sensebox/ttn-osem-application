#!/bin/bash

function runComposeCommand() {
  docker-compose -p ttnosemtest -f ./test/docker-compose.yml "$@"
}

runComposeCommand up --build -d ttn-osem-integration

# Allow the dust to settle
sleep 5

function cleanup {
  runComposeCommand down -v
}

trap cleanup EXIT 

runComposeCommand exec ttn-osem-integration npm test
