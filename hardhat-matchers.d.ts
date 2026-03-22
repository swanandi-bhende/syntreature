import "chai";

declare global {
  namespace Chai {
    interface Assertion {
      emit(contract: unknown, eventName: string): Assertion;
      reverted: Assertion;
      revertedWith(reason: string): Assertion;
    }
  }
}

export {};
