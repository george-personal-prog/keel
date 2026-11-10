import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  equipment: {
    platesKg: [1.25, 2.5, 5, 10, 15, 20, 25],
    defaultBarKg: 20,
    barKgByMovement: {},
    dumbbellStepKg: 2,
    dumbbellMinKg: 2,
    dumbbellMaxKg: 60,
    kettlebellsKg: [8, 12, 16, 20, 24, 28, 32, 40],
    cableStepKg: 2.5,
    machineStepKg: 5,
    beltStepKg: 2.5,
  },
  sessionBudgetMin: 60,
  warmupStyle: 'ramp',
};
