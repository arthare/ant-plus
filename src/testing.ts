import { BicyclePowerScanner } from "./bicycle-power-sensors";
const fs = require('fs');

function doOneFile(file:string, minPower:number, maxPower:number) {

  const contents = fs.readFileSync('./test-files/raw-ant-52293.txt', 'utf8');
  const lines = contents.split('\n');

  const bps = new BicyclePowerScanner({});
  bps.on('powerData', (data) => {
    debugger;
  });

}

export function doSelfCheckTest() {
  doOneFile('./test-files/raw-ant-52293.txt', 0, 500);
}