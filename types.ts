
export enum TimerStatus {
  IDLE = 'IDLE',
  PREPARE = 'PREPARE',
  WORK = 'WORK',
  REST = 'REST',
  FINISHED = 'FINISHED'
}

export interface TrainingSettings {
  roundCount: number;
  roundDuration: number; // in seconds
  restDuration: number; // in seconds
  prepDuration: number; // in seconds
  calloutFrequency: number; // in seconds
  calloutFrequencyRandomness: number; // variance in seconds
  voiceName?: string; // Local voice preference
}

export interface Callout {
  id: string;
  text: string;
  active: boolean;
}
