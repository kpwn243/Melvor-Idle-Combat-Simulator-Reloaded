/*  Melvor Idle Combat Simulator

    Copyright (C) <2020>  <Coolrox95>
    Modified Copyright (C) <2020> <Visua0>
    Modified Copyright (C) <2020, 2021> <G. Miclotte>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

(() => {
    // spoof MICSR
    const MICSR: any = {
        debug: (...args: any[]) => console.debug('MICSR:', ...args),
        log: (...args: any[]) => console.log('MICSR:', ...args),
        warn: (...args: any[]) => console.warn('MICSR:', ...args),
        error: (...args: any[]) => console.error('MICSR:', ...args),
    }

    // spoof document
    const document = {
        getElementById() {
        },
        createElement() {
        },
    };

    // spoof $ so we get useful information regarding where the bugs are
    const $ = (...args: any[]) => console.log(...args);

    let combatSimulator: CombatSimulator;

    onmessage = (event) => {
        /*
        // TODO: remove temporary reply
        switch (event.data.action) {
            case 'RECEIVE_GAMEDATA':
                // constants
                event.data.constantNames.forEach((name: any) => {
                    self[name] = event.data.constants[name];
                });
                // functions
                event.data.functionNames.forEach((name: any) => {
                    eval(event.data.functions[name]);
                });
                // classes
                event.data.classNames.forEach((name: any) => {
                    eval(event.data.classes[name]);
                });
                // create instances
                return;
            case 'START_SIMULATION':
                postMessage({
                    action: 'FINISHED_SIM',
                    monsterID: event.data.monsterID,
                    dungeonID: event.data.dungeonID,
                    simResult: {
                        // success
                        simSuccess: true,
                        reason: undefined,
                        tickCount: 10,
                        // xp rates
                        xpPerSecond: 10,
                        hpXpPerSecond: 10,
                        slayerXpPerSecond: 10,
                        prayerXpPerSecond: 10,
                        summoningXpPerSecond: 10,
                        // consumables
                        ppConsumedPerSecond: 10,
                        ammoUsedPerSecond: 0,
                        runesUsedPerSecond: 0,
                        usedRunesBreakdown: 0,
                        combinationRunesUsedPerSecond: 0,
                        potionsUsedPerSecond: 0, // TODO: divide by potion capacity
                        tabletsUsedPerSecond: 0,
                        atePerSecond: 0,
                        // survivability
                        deathRate: 0.5,
                        highestDamageTaken: 10,
                        lowestHitpoints: 10,
                        // kill time
                        killTimeS: 10,
                        killsPerSecond: 0.1,
                        // loot gains
                        baseGpPerSecond: 10, // gpPerSecond is computed from this
                        dropChance: NaN,
                        signetChance: NaN,
                        petChance: NaN,
                        petRolls: [],
                        slayerCoinsPerSecond: 0,
                        // not displayed -> TODO: remove?
                        simulationTime: NaN,
                    },
                    selfTime: 0,
                });
                return;
            case 'CANCEL_SIMULATION':
                combatSimulator.cancelSimulation();
                return;
        }
         */
        switch (event.data.action) {
            case 'RECEIVE_GAMEDATA':
                // constants
                event.data.constantNames.forEach((name: any) => {
                    MICSR.log('constant', name, event.data.constants[name])
                    if (name.startsWith('MICSR.')) {
                        MICSR[name.substr(6)] = event.data.constants[name];
                    } else {
                        self[name] = event.data.constants[name];
                    }
                });
                // functions
                event.data.functionNames.forEach((name: any) => {
                    MICSR.log('function', name, event.data.functions[name])
                    eval(event.data.functions[name]);
                });
                // classes
                event.data.classNames.forEach((name: any) => {
                    MICSR.log('class', name)
                    eval(event.data.classes[name]);
                });
                // create instances
                // @ts-expect-error TS(2304): Cannot find name 'pako'.
                self.pako = {
                    inflate: (x: any) => {
                        const buffer = new ArrayBuffer(x.length);
                        const dataView = new DataView(buffer);
                        x.forEach((entry: number, idx: number) => dataView.setUint8(idx, entry));
                        return {buffer: buffer};
                    }
                };
                // restore data
                const cloneData = new MICSR.CloneData();
                cloneData.restoreModifierData();
                // @ts-expect-error TS(2304): Cannot find name 'slayerTaskData'.
                SlayerTask.data = MICSR.slayerTaskData;
                MICSR.log('Creating exp');
                // @ts-expect-error TS(2304): Cannot find name 'ExperienceCalculator'.
                const exp = new ExperienceCalculator()
                MICSR.log('Creating game');
                // @ts-expect-error TS(2304): Cannot find name 'Game'.
                const game = new Game();
                MICSR.log('Creating MICSR');
                MICSR.setup(game);
                combatSimulator = new CombatSimulator();
                break;
            case 'START_SIMULATION':
                const startTime = performance.now();
                //settings
                // run the simulation
                combatSimulator.simulateMonster(
                    event.data.playerString,
                    event.data.monsterID,
                    event.data.dungeonID,
                    event.data.trials,
                    event.data.maxTicks,
                ).then((simResult: any) => {
                    const timeTaken = performance.now() - startTime;
                    postMessage({
                        action: 'FINISHED_SIM',
                        monsterID: event.data.monsterID,
                        dungeonID: event.data.dungeonID,
                        simResult: simResult,
                        selfTime: timeTaken
                    });
                });
                break;
            case 'CANCEL_SIMULATION':
                combatSimulator.cancelSimulation();
                break;
        }
    };

    onerror = (error) => {
        postMessage({
            action: 'ERR_SIM',
            error: error,
        });
    }

    class CombatSimulator {
        cancelStatus: any;

        constructor() {
            this.cancelStatus = false;
        }

        /**
         * Simulation Method for a single monster
         */
        async simulateMonster(playerString: string, monsterID: string, dungeonID: string, trials: number, maxTicks: number) {
            MICSR.log('Creating manager');
            (self as any).numberMultiplier = undefined;
            const manager = new MICSR.SimManager(MICSR.game, MICSR.namespace);
            MICSR.log('Creating player', playerString);
            // @ts-expect-error TS(2304): Cannot find name 'pako'.
            console.log('received', pako.inflate(playerString).buffer)
            const atobCopy = atob;
            self.atob = (x: any) => x;
            const player = MICSR.SimPlayer.newFromPlayerString(manager, playerString);
            self.atob = atobCopy;
            player.initForWebWorker();
            MICSR.log('Finished setup');
            try {
                return manager.convertSlowSimToResult(manager.runTrials(monsterID, dungeonID, trials, maxTicks), trials);
            } catch (error) {
                MICSR.error(`Error while simulating monster ${monsterID} in dungeon ${dungeonID}: ${error}`);
                return {
                    simSuccess: false,
                    reason: 'simulation error',
                }
            }
        }

        /**
         * Checks if the simulation has been messaged to be cancelled
         * @return {Promise<boolean>}
         */
        async isCanceled() {
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve(this.cancelStatus);
                });
            });
        }

        cancelSimulation() {
            this.cancelStatus = true;
        }
    }
})();