import { BicyclePowerScanner, BicyclePowerSensorState, updateState } from "./bicycle-power-sensors";
const fs = require('fs');

function doOneFile(file:string, deviceId:number, minPower:number, maxPower:number, myChannel:number) {

  const contents = fs.readFileSync(file, 'utf8');
  let lines = contents.split('\n');
  lines = lines.slice(2);

  const bps = new BicyclePowerScanner({on:()=>{}});
  bps.deviceID = deviceId;
  (bps as any).states[deviceId] = {DeviceID: deviceId};

  let lastSequence = [];
  bps.on('powerData', (data) => {
    if(data.Power >= maxPower) {
      throw new Error("Parsing for file " + file + " got power " + data.Power + " which was higher than expected " + maxPower);
    }

    if(lastSequence.length < 3) { 
    } else {
      lastSequence.shift();
    };
    lastSequence.push(data.Power);
  });

  let state = new BicyclePowerSensorState(deviceId);

  for(var line of lines) {
    const cols = line.split('\t');
    const tm = parseInt(cols[0]);
    if(tm === 1646783314075 || tm === 1646783315073) {
      debugger;
    }
    const rawBytes = cols.slice(1).map((col) => parseInt(col));
    if(rawBytes[3] === myChannel) {
      const buf = Buffer.from(rawBytes);
      updateState(bps, state, buf);
    }
  }

}

export function doSelfCheckTest() {
  doOneFile('./test-files/raw-ant-many-zeros.txt', 28746, 0, 700, 0);
  //doOneFile('./test-files/raw-ant-52293.txt', 52293, 0, 700, 1);
}
doSelfCheckTest();