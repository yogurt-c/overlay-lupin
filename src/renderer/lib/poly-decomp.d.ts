declare module 'poly-decomp' {
  const decomp: {
    makeCCW(points: number[][]): boolean;
    isSimple(points: number[][]): boolean;
    quickDecomp(points: number[][]): number[][][];
  };
  export default decomp;
}
