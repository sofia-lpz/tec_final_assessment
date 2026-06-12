import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

// Mock the Service module
const serviceMock = {
    login: mock.fn(),
    incrementTokenVersion: mock.fn(),
    createUser: mock.fn(),
    getUsers: mock.fn(),
    getOneUser: mock.fn(),
    updateUser: mock.fn(),
    deleteUser: mock.fn(),
    countAdminUsers: mock.fn(),
    createScenario: mock.fn(),
    getScenariosByUser: mock.fn(),
    getOneScenarioByUser: mock.fn(),
    updateScenario: mock.fn(),
    deleteScenario: mock.fn(),
};

mock.module('../api/service.js', {
    namedExports: serviceMock,
});

// Mock jsonwebtoken
const jwtMock = {
    sign: mock.fn(() => 'fake.jwt.token'),
    verify: mock.fn(),
};

mock.module('jsonwebtoken', {
    defaultExport: jwtMock,
    namedExports: jwtMock,
});

// Mock logger
mock.module('../utils/logger/logger.js', {
    namedExports: {
        logger: {
            info: mock.fn(),
            warn: mock.fn(),
            error: mock.fn(),
        },
    },
});

const Controller = await import('../api/controller.js');

function resetMocks() {
    for (const fn of Object.values(serviceMock)) {
        fn.mock.resetCalls();
        fn.mock.mockImplementation(() => {});
    }
    jwtMock.sign.mock.resetCalls();
    jwtMock.sign.mock.mockImplementation(() => 'fake.jwt.token');
}

// Minimal mock res object
function createMockRes() {
    const res = {
        statusCode: 200,
        headers: {},
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        send(payload) {
            this.body = payload;
            return this;
        },
        set(key, value) {
            this.headers[key] = value;
            return this;
        },
    };
    return res;
}

const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

describe('Controller.login', () => {
    beforeEach(() => {
        resetMocks();
        process.env.JWT_SECRET = 'test-secret';
    });

    afterEach(() => {
        process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    });

    test('returns token and role on successful login', async () => {
        const fakeUser = { id: 1, username: 'alice', role: 'admin', token_version: 0 };
        serviceMock.login.mock.mockImplementation(async () => fakeUser);

        const req = { body: { username: 'alice', password: 'pw' }, ip: '127.0.0.1' };
        const res = createMockRes();

        await Controller.login(req, res);

        assert.equal(res.body.status, 'OK');
        assert.equal(res.body.role, 'admin');
        assert.equal(res.body.token, 'fake.jwt.token');
        assert.equal(jwtMock.sign.mock.callCount(), 1);
        const [payload, secret, opts] = jwtMock.sign.mock.calls[0].arguments;
        assert.deepEqual(payload, { id: 1, username: 'alice', tokenVersion: 0 });
        assert.equal(secret, 'test-secret');
        assert.deepEqual(opts, { expiresIn: '1h' });
    });

    test('returns 401 for invalid credentials (user not found)', async () => {
        serviceMock.login.mock.mockImplementation(async () => {
            throw new Error('User not found');
        });

        const req = { body: { username: 'ghost', password: 'pw' }, ip: '127.0.0.1' };
        const res = createMockRes();

        await Controller.login(req, res);

        assert.equal(res.statusCode, 401);
        assert.deepEqual(res.body, { status: 'Error', message: 'Invalid credentials' });
    });

    test('returns 401 for invalid password', async () => {
        serviceMock.login.mock.mockImplementation(async () => {
            throw new Error('Invalid password');
        });

        const req = { body: { username: 'alice', password: 'wrong' }, ip: '127.0.0.1' };
        const res = createMockRes();

        await Controller.login(req, res);

        assert.equal(res.statusCode, 401);
        assert.deepEqual(res.body, { status: 'Error', message: 'Invalid credentials' });
    });

    test('returns 500 for unexpected errors', async () => {
        serviceMock.login.mock.mockImplementation(async () => {
            throw new Error('Connection refused');
        });

        const req = { body: { username: 'alice', password: 'pw' }, ip: '127.0.0.1' };
        const res = createMockRes();

        await Controller.login(req, res);

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { status: 'Error', message: 'Internal Server Error' });
    });

    test('does not send response when user is falsy', async () => {
        serviceMock.login.mock.mockImplementation(async () => null);

        const req = { body: { username: 'alice', password: 'pw' }, ip: '127.0.0.1' };
        const res = createMockRes();

        await Controller.login(req, res);

        assert.equal(res.body, undefined);
        assert.equal(res.statusCode, 200);
    });
});

describe('Controller.register', () => {
    beforeEach(resetMocks);

    test('creates user with role "user" and returns id', async () => {
        serviceMock.createUser.mock.mockImplementation(async () => 42);

        const req = { body: { username: 'newuser', password: 'pw' } };
        const res = createMockRes();

        await Controller.register(req, res);

        assert.deepEqual(res.body, { id: 42, username: 'newuser', role: 'user' });
        assert.deepEqual(serviceMock.createUser.mock.calls[0].arguments, ['newuser', 'pw', 'user']);
    });

    test('returns 500 on error', async () => {
        serviceMock.createUser.mock.mockImplementation(async () => {
            throw new Error('Username already exists');
        });

        const req = { body: { username: 'dup', password: 'pw' } };
        const res = createMockRes();

        await Controller.register(req, res);

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'Username already exists' });
    });
});

describe('Controller.logout', () => {
    beforeEach(resetMocks);

    test('increments token version and returns success', async () => {
        serviceMock.incrementTokenVersion.mock.mockImplementation(async () => ({}));

        const req = { userId: 1 };
        const res = createMockRes();

        await Controller.logout(req, res);

        assert.deepEqual(res.body, { status: 'OK', message: 'Logged out' });
        assert.equal(serviceMock.incrementTokenVersion.mock.calls[0].arguments[0], 1);
    });

    test('returns 500 on error', async () => {
        serviceMock.incrementTokenVersion.mock.mockImplementation(async () => {
            throw new Error('DB error');
        });

        const req = { userId: 1 };
        const res = createMockRes();

        await Controller.logout(req, res);

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { status: 'Error', message: 'Internal Server Error' });
    });
});

describe('Controller.getUsers', () => {
    beforeEach(resetMocks);

    test('returns paginated data with sort params', async () => {
        const fakeUsers = [{ id: 1 }, { id: 2 }, { id: 3 }];
        serviceMock.getUsers.mock.mockImplementation(async () => fakeUsers);

        const req = { query: { _sort: 'id', _order: 'ASC', _start: '0', _end: '2' } };
        const res = createMockRes();

        await Controller.getUsers(req, res);

        assert.deepEqual(res.body, [{ id: 1 }, { id: 2 }]);
        assert.equal(res.headers['X-Total-Count'], 3);
        assert.equal(res.headers['Content-Range'], '0-2/3');
    });

    test('returns full data without sort params', async () => {
        const fakeUsers = [{ id: 1 }, { id: 2 }];
        serviceMock.getUsers.mock.mockImplementation(async () => fakeUsers);

        const req = { query: {} };
        const res = createMockRes();

        await Controller.getUsers(req, res);

        assert.deepEqual(res.body, fakeUsers);
        assert.equal(res.headers['X-Total-Count'], 2);
        assert.equal(res.headers['Content-Range'], '0-2/2');
    });

    test('returns 500 on error', async () => {
        serviceMock.getUsers.mock.mockImplementation(async () => {
            throw new Error('DB error');
        });

        const req = { query: {} };
        const res = createMockRes();

        await Controller.getUsers(req, res);

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'DB error' });
    });
});

describe('Controller.updateUser', () => {
    beforeEach(resetMocks);

    test('updates a non-admin user normally', async () => {
        serviceMock.getOneUser.mock.mockImplementation(async () => ({ id: 2, role: 'user' }));
        serviceMock.updateUser.mock.mockImplementation(async () => ({ id: 2, username: 'bob', role: 'admin' }));

        const req = { params: { id: '2' }, body: { role: 'admin' }, userId: 1 };
        const res = createMockRes();

        await Controller.updateUser(req, res);

        assert.deepEqual(res.body, { id: 2, username: 'bob', role: 'admin' });
        assert.equal(serviceMock.countAdminUsers.mock.callCount(), 0);
    });

    test('prevents demoting the last admin user', async () => {
        serviceMock.getOneUser.mock.mockImplementation(async () => ({ id: 1, role: 'admin' }));
        serviceMock.countAdminUsers.mock.mockImplementation(async () => 1);

        const req = { params: { id: '1' }, body: { role: 'user' }, userId: 1 };
        const res = createMockRes();

        await Controller.updateUser(req, res);

        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.body, { error: 'Cannot demote the last admin user' });
        assert.equal(serviceMock.updateUser.mock.callCount(), 0);
    });

    test('allows demoting admin when other admins exist', async () => {
        serviceMock.getOneUser.mock.mockImplementation(async () => ({ id: 1, role: 'admin' }));
        serviceMock.countAdminUsers.mock.mockImplementation(async () => 2);
        serviceMock.updateUser.mock.mockImplementation(async () => ({ id: 1, username: 'admin', role: 'user' }));

        const req = { params: { id: '1' }, body: { role: 'user' }, userId: 5 };
        const res = createMockRes();

        await Controller.updateUser(req, res);

        assert.deepEqual(res.body, { id: 1, username: 'admin', role: 'user' });
    });

    test('returns 500 on error', async () => {
        serviceMock.getOneUser.mock.mockImplementation(async () => {
            throw new Error('DB error');
        });

        const req = { params: { id: '1' }, body: {}, userId: 1 };
        const res = createMockRes();

        await Controller.updateUser(req, res);

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'DB error' });
    });
});

describe('Controller.createUser', () => {
    beforeEach(resetMocks);

    test('creates a user and returns id', async () => {
        serviceMock.createUser.mock.mockImplementation(async () => 7);

        const req = { body: { username: 'new', password: 'pw', role: 'user' }, userId: 1 };
        const res = createMockRes();

        await Controller.createUser(req, res);

        assert.deepEqual(res.body, { id: 7, username: 'new', role: 'user' });
    });

    test('returns 500 on error', async () => {
        serviceMock.createUser.mock.mockImplementation(async () => {
            throw new Error('Username already exists');
        });

        const req = { body: { username: 'dup', password: 'pw', role: 'user' }, userId: 1 };
        const res = createMockRes();

        await Controller.createUser(req, res);

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'Username already exists' });
    });
});

describe('Controller.deleteUser', () => {
    beforeEach(resetMocks);

    test('returns 400 if id is missing', async () => {
        const req = { params: {} };
        const res = createMockRes();

        await Controller.deleteUser(req, res);

        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.body, { error: 'ID is required' });
    });

    test('deletes a non-admin user normally', async () => {
        serviceMock.getOneUser.mock.mockImplementation(async () => ({ id: 2, role: 'user' }));
        serviceMock.deleteUser.mock.mockImplementation(async () => ({ affectedRows: 1 }));

        const req = { params: { id: '2' }, userId: 1 };
        const res = createMockRes();

        await Controller.deleteUser(req, res);

        assert.deepEqual(res.body, { affectedRows: 1 });
    });

    test('prevents deleting the last admin user', async () => {
        serviceMock.getOneUser.mock.mockImplementation(async () => ({ id: 1, role: 'admin' }));
        serviceMock.countAdminUsers.mock.mockImplementation(async () => 1);

        const req = { params: { id: '1' }, userId: 1 };
        const res = createMockRes();

        await Controller.deleteUser(req, res);

        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.body, { error: 'Cannot delete the last admin user' });
        assert.equal(serviceMock.deleteUser.mock.callCount(), 0);
    });

    test('allows deleting admin when other admins exist', async () => {
        serviceMock.getOneUser.mock.mockImplementation(async () => ({ id: 1, role: 'admin' }));
        serviceMock.countAdminUsers.mock.mockImplementation(async () => 2);
        serviceMock.deleteUser.mock.mockImplementation(async () => ({ affectedRows: 1 }));

        const req = { params: { id: '1' }, userId: 5 };
        const res = createMockRes();

        await Controller.deleteUser(req, res);

        assert.deepEqual(res.body, { affectedRows: 1 });
    });

    test('returns 500 on error', async () => {
        serviceMock.getOneUser.mock.mockImplementation(async () => {
            throw new Error('DB error');
        });

        const req = { params: { id: '1' }, userId: 1 };
        const res = createMockRes();

        await Controller.deleteUser(req, res);

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'DB error' });
    });
});

describe('Controller.getOneUser', () => {
    beforeEach(resetMocks);

    test('returns 400 if id is missing', async () => {
        const req = { params: {} };
        const res = createMockRes();

        await Controller.getOneUser(req, res);

        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.body, { error: 'ID is required' });
    });

    test('returns user data', async () => {
        serviceMock.getOneUser.mock.mockImplementation(async () => ({ id: 1, username: 'alice', role: 'admin' }));

        const req = { params: { id: '1' } };
        const res = createMockRes();

        await Controller.getOneUser(req, res);

        assert.deepEqual(res.body, { id: 1, username: 'alice', role: 'admin' });
    });

    test('returns 500 on error', async () => {
        serviceMock.getOneUser.mock.mockImplementation(async () => {
            throw new Error('DB error');
        });

        const req = { params: { id: '1' } };
        const res = createMockRes();

        await Controller.getOneUser(req, res);

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'DB error' });
    });
});

const VALID_SCENARIO = {
    name: 'Test Scenario',
    broadcast_reward: 1,
    destroyed_reward: -1,
    conquer_reward: 5,
    colonize_reward: 2,
    survive_reward: 1,
    population_reward: 1,
    science_reward: 1,
    explore_reward: 1,
    invalid_reward: -5,
    civilizations: 2,
    map_width: 50,
    map_height: 50,
    planets: 10,
    harvest_rate: 0.5,
    initial_resources: 100,
    initial_population: 10,
    max_steps: 1000,
    critic: 'IPPO',
    learning_rate: 0.001,
    gamma: 0.99,
};

describe('Controller.createScenario', () => {
    beforeEach(resetMocks);

    test('creates scenario with valid data', async () => {
        serviceMock.createScenario.mock.mockImplementation(async () => 100);

        const req = { body: { scenario: VALID_SCENARIO }, userId: 1 };
        const res = createMockRes();

        await Controller.createScenario(req, res);

        assert.deepEqual(res.body, { id: 100, name: 'Test Scenario', user_id: 1 });
    });

    test('returns 400 when required fields are missing', async () => {
        const incomplete = { ...VALID_SCENARIO };
        delete incomplete.map_width;
        delete incomplete.gamma;

        const req = { body: { scenario: incomplete }, userId: 1 };
        const res = createMockRes();

        await Controller.createScenario(req, res);

        assert.equal(res.statusCode, 400);
        assert.match(res.body.error, /Missing required fields/);
        assert.match(res.body.error, /map_width/);
        assert.match(res.body.error, /gamma/);
        assert.equal(serviceMock.createScenario.mock.callCount(), 0);
    });

    test('returns 400 for invalid critic value', async () => {
        const invalidScenario = { ...VALID_SCENARIO, critic: 'RANDOM' };

        const req = { body: { scenario: invalidScenario }, userId: 1 };
        const res = createMockRes();

        await Controller.createScenario(req, res);

        assert.equal(res.statusCode, 400);
        assert.match(res.body.error, /Invalid critic/);
        assert.equal(serviceMock.createScenario.mock.callCount(), 0);
    });

    test('accepts MAPPO as a valid critic', async () => {
        serviceMock.createScenario.mock.mockImplementation(async () => 101);

        const mappoScenario = { ...VALID_SCENARIO, critic: 'MAPPO' };
        const req = { body: { scenario: mappoScenario }, userId: 1 };
        const res = createMockRes();

        await Controller.createScenario(req, res);

        assert.deepEqual(res.body, { id: 101, name: 'Test Scenario', user_id: 1 });
    });

    test('returns 500 on service error', async () => {
        serviceMock.createScenario.mock.mockImplementation(async () => {
            throw new Error('Insert failed');
        });

        const req = { body: { scenario: VALID_SCENARIO }, userId: 1 };
        const res = createMockRes();

        await Controller.createScenario(req, res);

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'Insert failed' });
    });
});

describe('Controller.getScenariosByUser', () => {
    beforeEach(resetMocks);

    test('returns rows with default pagination headers', async () => {
        serviceMock.getScenariosByUser.mock.mockImplementation(async () => ({
            rows: [{ id: 1 }, { id: 2 }],
            total: 2,
        }));

        const req = { query: {}, userId: 1 };
        const res = createMockRes();

        await Controller.getScenariosByUser(req, res);

        assert.deepEqual(res.body, [{ id: 1 }, { id: 2 }]);
        assert.equal(res.headers['X-Total-Count'], 2);
        assert.equal(res.headers['Content-Range'], '0-2/2');
    });

    test('passes sort options to service', async () => {
        serviceMock.getScenariosByUser.mock.mockImplementation(async () => ({ rows: [], total: 0 }));

        const req = { query: { _sort: 'name', _order: 'ASC' }, userId: 1 };
        const res = createMockRes();

        await Controller.getScenariosByUser(req, res);

        const [, options] = serviceMock.getScenariosByUser.mock.calls[0].arguments;
        assert.deepEqual(options, { sortBy: 'name', sortOrder: 'ASC' });
    });

    test('passes pagination options to service', async () => {
        serviceMock.getScenariosByUser.mock.mockImplementation(async () => ({ rows: [], total: 0 }));

        const req = { query: { _start: '5', _end: '15' }, userId: 1 };
        const res = createMockRes();

        await Controller.getScenariosByUser(req, res);

        const [, options] = serviceMock.getScenariosByUser.mock.calls[0].arguments;
        assert.equal(options.start, 5);
        assert.equal(options.limit, 10);
    });

    test('returns 500 on error', async () => {
        serviceMock.getScenariosByUser.mock.mockImplementation(async () => {
            throw new Error('DB error');
        });

        const req = { query: {}, userId: 1 };
        const res = createMockRes();

        await Controller.getScenariosByUser(req, res);

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'DB error' });
    });
});

describe('Controller.getOneScenarioByUser', () => {
    beforeEach(resetMocks);

    test('returns scenario when found', async () => {
        serviceMock.getOneScenarioByUser.mock.mockImplementation(async () => ({ id: 1, name: 'Test' }));

        const req = { params: { id: '1' }, userId: 1 };
        const res = createMockRes();

        await Controller.getOneScenarioByUser(req, res);

        assert.deepEqual(res.body, { id: 1, name: 'Test' });
    });

    test('returns 404 when scenario not found', async () => {
        serviceMock.getOneScenarioByUser.mock.mockImplementation(async () => undefined);

        const req = { params: { id: '999' }, userId: 1 };
        const res = createMockRes();

        await Controller.getOneScenarioByUser(req, res);

        assert.equal(res.statusCode, 404);
        assert.deepEqual(res.body, { error: 'Scenario not found' });
    });

    test('returns 500 on error', async () => {
        serviceMock.getOneScenarioByUser.mock.mockImplementation(async () => {
            throw new Error('DB error');
        });

        const req = { params: { id: '1' }, userId: 1 };
        const res = createMockRes();

        await Controller.getOneScenarioByUser(req, res);

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'DB error' });
    });
});

describe('Controller.updateScenario', () => {
    beforeEach(resetMocks);

    test('returns 400 if id is missing', async () => {
        const req = { params: {}, body: {}, userId: 1 };
        const res = createMockRes();

        await Controller.updateScenario(req, res);

        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.body, { error: 'ID is required' });
    });

    test('returns 403 when scenario does not belong to user', async () => {
        serviceMock.getOneScenarioByUser.mock.mockImplementation(async () => undefined);

        const req = { params: { id: '1' }, body: { name: 'New Name' }, userId: 1 };
        const res = createMockRes();

        await Controller.updateScenario(req, res);

        assert.equal(res.statusCode, 403);
        assert.deepEqual(res.body, { error: 'Access denied' });
        assert.equal(serviceMock.updateScenario.mock.callCount(), 0);
    });

    test('returns 400 for invalid critic in partial update', async () => {
        serviceMock.getOneScenarioByUser.mock.mockImplementation(async () => ({ id: 1, user_id: 1 }));

        const req = { params: { id: '1' }, body: { critic: 'INVALID' }, userId: 1 };
        const res = createMockRes();

        await Controller.updateScenario(req, res);

        assert.equal(res.statusCode, 400);
        assert.match(res.body.error, /Invalid critic/);
        assert.equal(serviceMock.updateScenario.mock.callCount(), 0);
    });

    test('updates scenario with valid partial data', async () => {
        serviceMock.getOneScenarioByUser.mock.mockImplementation(async () => ({ id: 1, user_id: 1 }));
        serviceMock.updateScenario.mock.mockImplementation(async () => ({ id: 1, name: 'New Name' }));

        const req = { params: { id: '1' }, body: { name: 'New Name' }, userId: 1 };
        const res = createMockRes();

        await Controller.updateScenario(req, res);

        assert.deepEqual(res.body, { id: 1, name: 'New Name' });
    });

    test('allows updating critic to a valid value', async () => {
        serviceMock.getOneScenarioByUser.mock.mockImplementation(async () => ({ id: 1, user_id: 1 }));
        serviceMock.updateScenario.mock.mockImplementation(async () => ({ id: 1, critic: 'MAPPO' }));

        const req = { params: { id: '1' }, body: { critic: 'MAPPO' }, userId: 1 };
        const res = createMockRes();

        await Controller.updateScenario(req, res);

        assert.deepEqual(res.body, { id: 1, critic: 'MAPPO' });
    });

    test('returns 500 on error', async () => {
        serviceMock.getOneScenarioByUser.mock.mockImplementation(async () => {
            throw new Error('DB error');
        });

        const req = { params: { id: '1' }, body: {}, userId: 1 };
        const res = createMockRes();

        await Controller.updateScenario(req, res);

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'DB error' });
    });
});

describe('Controller.deleteScenario', () => {
    beforeEach(resetMocks);

    test('returns 400 if id is missing', async () => {
        const req = { params: {}, userId: 1 };
        const res = createMockRes();

        await Controller.deleteScenario(req, res);

        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.body, { error: 'ID is required' });
    });

    test('returns 403 when scenario does not belong to user', async () => {
        serviceMock.getOneScenarioByUser.mock.mockImplementation(async () => undefined);

        const req = { params: { id: '1' }, userId: 1 };
        const res = createMockRes();

        await Controller.deleteScenario(req, res);

        assert.equal(res.statusCode, 403);
        assert.deepEqual(res.body, { error: 'Access denied' });
        assert.equal(serviceMock.deleteScenario.mock.callCount(), 0);
    });

    test('deletes scenario when owned by user', async () => {
        serviceMock.getOneScenarioByUser.mock.mockImplementation(async () => ({ id: 1, user_id: 1 }));
        serviceMock.deleteScenario.mock.mockImplementation(async () => ({ affectedRows: 1 }));

        const req = { params: { id: '1' }, userId: 1 };
        const res = createMockRes();

        await Controller.deleteScenario(req, res);

        assert.deepEqual(res.body, { affectedRows: 1 });
    });

    test('returns 500 on error', async () => {
        serviceMock.getOneScenarioByUser.mock.mockImplementation(async () => {
            throw new Error('DB error');
        });

        const req = { params: { id: '1' }, userId: 1 };
        const res = createMockRes();

        await Controller.deleteScenario(req, res);

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: 'DB error' });
    });
});