import "chai";

declare global {
  namespace Chai {
    interface Assertion {
      emit(contract: unknown, eventName: string): Assertion;
      reverted: Assertion;
      revertedWith(reason: string): Assertion;
      revertedWithCustomError(contract: unknown, customErrorName: string): Assertion;
    }
  }
}

export {};
