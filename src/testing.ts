import { BicyclePowerScanner, BicyclePowerSensorState, updateState } from "./bicycle-power-sensors";
const fs = require('fs');

function doOneFile(file:string, deviceId:number, minPower:number, maxPower:number, myChannel:number) {

  const contents = fs.readFileSync(file, 'utf8');
  let lines = contents.split('\n');
  lines = lines.slice(2);

  const bps = new BicyclePowerScanner({on:()=>{}});
  bps.deviceID = deviceId;
  (bps as any).states[deviceId] = {DeviceID: deviceId};
  bps.on('powerData', (data) => {
    if(data.Power >= maxPower) {
      throw new Error("Parsing for file " + file + " got power " + data.Power + " which was higher than expected " + maxPower);
    }
  });

  let state = new BicyclePowerSensorState(deviceId);

  for(var line of lines) {
    const cols = line.split('\t');
    const tm = parseInt(cols[0]);
    const rawBytes = cols.slice(1).map((col) => parseInt(col));
    if(rawBytes[3] === myChannel) {
      const buf = Buffer.from(rawBytes);
      updateState(bps, state, buf);
    }
  }

}

export function doSelfCheckTest() {
  doOneFile('./test-files/raw-ant-52293.txt', 52293, 0, 700, 1);
}
doSelfCheckTest();