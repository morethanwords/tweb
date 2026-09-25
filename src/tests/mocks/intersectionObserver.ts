export class IntersectionObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
