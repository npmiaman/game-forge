declare module 'zzfx' {
  export const ZZFX: {
    volume: number;
    sampleRate: number;
    audioContext: AudioContext;
    buildSamples(...params: (number | undefined)[]): number[];
    getNote(semitoneOffset?: number, rootNoteFrequency?: number): number;
  };
  export function zzfx(...params: (number | undefined)[]): AudioBufferSourceNode;
}
