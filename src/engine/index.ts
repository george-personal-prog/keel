/** Public API of the KEEL programming engine. The UI imports only from here. */

export * from './types';
export { DEFAULT_SETTINGS } from './defaults';
export { prescribeNextSession, currentDay } from './generate';
export { createInitialState, completeSession, changeTrack, swapExercise, declineDeload, migrateState } from './state';
export { MOVEMENTS, getMovement, swapOptions } from './movements/library';
export { checkRestriction } from './movements/restrictions';
export { BENCHMARKS } from './conditioning';
export { e1rm, bestSetE1rm } from './e1rm';
export { estimateE1rm, rollingE1rm } from './history';
export { roundLoad, platesPerSide } from './loading';
export { assessDeload } from './deload';
export { prescribedSetsByMuscle, loggedSetsByMuscle, plannedWeek } from './volume';
export { splitFor, DAY_TEMPLATES } from './templates';
