/*
* ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#521_tab
* Spec sheet: https://www.thisisant.com/resources/bicycle-power/
*/

import { AntPlusSensor, AntPlusScanner, Messages } from './ant';

export class BicyclePowerSensorState {
	constructor(deviceID: number) {
		this.DeviceID = deviceID;
		this.lastCrankCount = -1
		this.lastAccumTorque = -1;
		this.lastCrankPeriod = -1;
	}

	DeviceID: number;
	PedalPower?: number;
	RightPedalPower?: number;
	LeftPedalPower?: number;
	Cadence?: number;
	AccumulatedPower?: number;
	Power?: number;
	offset: number = 0;
	EventCount?: number;
	TimeStamp?: number;
	Slope?: number;
	TorqueTicksStamp?: number;
	CalculatedCadence?: number;
	CalculatedTorque?: number;
	CalculatedPower?: number;

	lastCrankCount:number;
	lastAccumTorque:number;
	lastCrankPeriod:number;
}

class BicyclePowerScanState extends BicyclePowerSensorState {
	Rssi: number;
	Threshold: number;
}

export class BicyclePowerSensor extends AntPlusSensor {
	static deviceType = 0x0B;

	public attach(channel, deviceID): void {
		super.attach(channel, 'receive', deviceID, BicyclePowerSensor.deviceType, 0, 255, 8182);
		this.state = new BicyclePowerSensorState(deviceID);
	}

	private state: BicyclePowerSensorState;

	public updateState(deviceId, data) {
		this.state.DeviceID = deviceId;
		updateState(this, this.state, data);
	}
}

export class BicyclePowerScanner extends AntPlusScanner {
	protected deviceType() {
		return BicyclePowerSensor.deviceType;
	}

	private states: { [id: number]: BicyclePowerScanState } = {};

	protected createStateIfNew(deviceId) {
		if (!this.states[deviceId]) {
			this.states[deviceId] = new BicyclePowerScanState(deviceId);
		}
	}

	protected updateRssiAndThreshold(deviceId, rssi, threshold) {
		this.states[deviceId].Rssi = rssi;
		this.states[deviceId].Threshold = threshold;
	}

	public updateState(deviceId, data) {
		updateState(this, this.states[deviceId], data);
	}
}

function fixRollover(val:number, fixWith:number):number {
	if(val < 0) {
		val += fixWith;
	}
	return val;
}
export function updateState(
	sensor: BicyclePowerSensor | BicyclePowerScanner,
	state: BicyclePowerSensorState | BicyclePowerScanState,
	data: Buffer) {

	
	const page = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA);
	let hadNewPower = false;

	switch (page) {
		case 0x01: {
			const calID = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			if (calID === 0x10) {
				const calParam = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
				if (calParam === 0x01) {
					state.offset = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
				}
			}
			break;
		}
		case 0x10: {
			const pedalPower = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
			if (pedalPower !== 0xFF) {
				if (pedalPower & 0x80) {
					state.PedalPower = pedalPower & 0x7F;
					state.RightPedalPower = state.PedalPower;
					state.LeftPedalPower = 100 - state.RightPedalPower;
				} else {
					state.PedalPower = pedalPower & 0x7F;
					state.RightPedalPower = undefined;
					state.LeftPedalPower = undefined;
				}
			} else {
				state.PedalPower = undefined;
				state.RightPedalPower = undefined;
				state.LeftPedalPower = undefined;
			}
			const cadence = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			if (cadence !== 0xFF) {
				state.Cadence = cadence;
			} else {
				state.Cadence = undefined;
			}
			state.AccumulatedPower = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
			state.Power = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
			hadNewPower = true;
			break;
		}
		case 0x11: {
			// wheel-torque
			break;
		}
		case 0x12: {
			// crank-torque
			const updateCount = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			const crankCount = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
			const instCadence = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			const crankPeriod = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
			const accumTorque = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);

			state.Cadence = instCadence; // as a backup, use the instantaneous cadence
			const lastCrankCount = state.lastCrankCount || 0;
			if(crankCount !== lastCrankCount) {
				
				let deltaCranks = fixRollover(crankCount - lastCrankCount, 256);
				let deltaTorque = fixRollover(accumTorque - state.lastAccumTorque, 65536);
				let deltaPeriod = fixRollover(crankPeriod - state.lastCrankPeriod, 65536);
				if(state.lastAccumTorque >= 0 && state.lastCrankPeriod >= 0 && state.lastCrankCount >= 0) {
					const angularVel = 2*Math.PI*deltaCranks / (deltaPeriod / 2048);
					const torque = deltaTorque / (32*deltaCranks);
					const power = angularVel * torque;
					const cadence = 60 * (deltaCranks) / (deltaPeriod / 2048);
	
					state.Power = power;
					state.Cadence = cadence;
				} else {
					state.Power = 0; // we're just starting up, so just say we have power zero for now
				}
				hadNewPower = true;
			} else {
				// they sent us an event, but the crank hasn't rotated yet.  this is a weird asynchronous-rotating crank, we're going to ignore it.
			}
			state.lastAccumTorque = accumTorque;
			state.lastCrankPeriod = crankPeriod;
			state.lastCrankCount = crankCount;
			break;
		}
		case 0x20: {
			const oldEventCount = state.EventCount;
			const oldTimeStamp = state.TimeStamp;
			const oldTorqueTicksStamp = state.TorqueTicksStamp;

			let eventCount = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			const slope = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 3);
			let timeStamp = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 5);
			let torqueTicksStamp = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 7);

			if (timeStamp !== oldTimeStamp && eventCount !== oldEventCount) {
				state.EventCount = eventCount;
				if (oldEventCount > eventCount) { //Hit rollover value
					eventCount += 255;
				}

				state.TimeStamp = timeStamp;
				if (oldTimeStamp > timeStamp) { //Hit rollover value
					timeStamp += 65400;
				}

				state.Slope = slope;
				state.TorqueTicksStamp = torqueTicksStamp;
				if (oldTorqueTicksStamp > torqueTicksStamp) { //Hit rollover value
					torqueTicksStamp += 65535;
				}

				const elapsedTime = (timeStamp - oldTimeStamp) * 0.0005;
				const torqueTicks = torqueTicksStamp - oldTorqueTicksStamp;

				const cadencePeriod = elapsedTime / (eventCount - oldEventCount); // s
				const cadence = Math.round(60 / cadencePeriod); // rpm
				state.CalculatedCadence = cadence;

				const torqueFrequency = (1 / (elapsedTime / torqueTicks)) - state.offset; // Hz
				const torque = torqueFrequency / (slope / 10); // Nm
				state.CalculatedTorque = torque;

				state.CalculatedPower = torque * cadence * Math.PI / 30; // Watts
				hadNewPower = true;
			}
			break;
		}
		default:
			return;
	}

	if(hadNewPower) {
		sensor.emit('powerData', state);
	}
}
