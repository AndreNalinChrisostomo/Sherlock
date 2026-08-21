declare module "ml-cart" {
  export class DecisionTreeClassifier {
    constructor(options?: Record<string, unknown>);
    train(features: number[][], labels: number[]): void;
    predict(features: number[][]): number[];
  }
}

declare module "ml-logistic-regression" {
  export default class LogisticRegression {
    constructor(options?: Record<string, number>);
    train(features: import("ml-matrix").Matrix, labels: import("ml-matrix").Matrix): void;
    predict(features: import("ml-matrix").Matrix): number[];
  }
}
