declare module 'ml-matrix' {
    export class Matrix {
        constructor(values: number[][]);
        static columnVector(values: number[]): Matrix;
        transpose(): Matrix;
        mmul(matrix: Matrix): Matrix;
        mul(value: number | Matrix): Matrix;
        sub(matrix: Matrix): Matrix;
        get(row: number, column: number): number;
        set(row: number, column: number, value: number): Matrix;
    }

    export function pseudoInverse(matrix: Matrix): Matrix;
}
