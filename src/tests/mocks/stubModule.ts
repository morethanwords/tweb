/**
 * A stand-in for a module none of which a test needs: its default export answers every member with a mock that
 * returns nothing. `vi.mock('@lib/apiManagerProxy', () => import('@/tests/mocks/stubModule'))`
 */
export default new Proxy({}, {get: () => vi.fn()});
