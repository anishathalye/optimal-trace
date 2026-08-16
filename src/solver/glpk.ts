import type { GLPK, LP, Options } from 'glpk.js';
import type { ILPSolver, WindyLP } from './windy';

let glpkPromise: Promise<GLPK> | null = null;

async function getGlpk(): Promise<GLPK> {
  if (!glpkPromise) {
    glpkPromise = (async () => {
      const { default: GLPKFactory } = await import('glpk.js');
      return GLPKFactory();
    })();
  }
  return glpkPromise;
}

export const solveLP: ILPSolver = async (lp: WindyLP) => {
  const glpk = await getGlpk();
  const options: Options = { msglev: 0, presol: true };
  const result = await glpk.solve(lp as LP, options);
  return result.result.vars;
};
