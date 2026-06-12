import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

// Mock the db module before importing service
const dbMock = {
    verifyPassword: mock.fn(),
    incrementTokenVersion: mock.fn(),
    getUsers: mock.fn(),
    updateUser: mock.fn(),
    createUser: mock.fn(),
    deleteUser: mock.fn(),
    getOneUser: mock.fn(),
    countAdminUsers: mock.fn(),
    createScenario: mock.fn(),
    getScenariosByUser: mock.fn(),
    getOneScenarioByUser: mock.fn(),
    updateScenario: mock.fn(),
    deleteScenario: mock.fn(),
};

mock.module('../api/db.js', {
    namedExports: dbMock,
});

const Service = await import('../api/service.js');

function resetMocks() {
    for (const fn of Object.values(dbMock)) {
        fn.mock.resetCalls();
        fn.mock.mockImplementation(() => {});
    }
}

describe('service.login', () => {
    beforeEach(resetMocks);

    test('returns user on successful verification', async () => {
        const fakeUser = { id: 1, username: 'alice', role: 'user' };
        dbMock.verifyPassword.mock.mockImplementation(async () => fakeUser);

        const result = await Service.login('alice', 'pw');

        assert.deepEqual(result, fakeUser);
        assert.equal(dbMock.verifyPassword.mock.callCount(), 1);
        assert.deepEqual(dbMock.verifyPassword.mock.calls[0].arguments, ['alice', 'pw']);
    });

    test('propagates errors from db.verifyPassword', async () => {
        dbMock.verifyPassword.mock.mockImplementation(async () => {
            throw new Error('User not found');
        });

        await assert.rejects(() => Service.login('ghost', 'pw'), /User not found/);
    });
});

describe('service.incrementTokenVersion', () => {
    beforeEach(resetMocks);

    test('coerces id to Number before calling db', async () => {
        dbMock.incrementTokenVersion.mock.mockImplementation(async () => ({ affectedRows: 1 }));

        await Service.incrementTokenVersion('42');

        assert.equal(dbMock.incrementTokenVersion.mock.calls[0].arguments[0], 42);
    });

    test('propagates db errors', async () => {
        dbMock.incrementTokenVersion.mock.mockImplementation(async () => {
            throw new Error('DB error');
        });

        await assert.rejects(() => Service.incrementTokenVersion(1), /DB error/);
    });
});

describe('service.getUsers', () => {
    beforeEach(resetMocks);

    test('returns data from db.getUsers', async () => {
        const fakeUsers = [{ id: 1, username: 'alice', role: 'user' }];
        dbMock.getUsers.mock.mockImplementation(async () => fakeUsers);

        const req = { query: {} };
        const result = await Service.getUsers(req);

        assert.deepEqual(result, fakeUsers);
        assert.equal(dbMock.getUsers.mock.calls[0].arguments[0], req);
    });

    test('propagates db errors', async () => {
        dbMock.getUsers.mock.mockImplementation(async () => {
            throw new Error('DB error');
        });

        await assert.rejects(() => Service.getUsers({ query: {} }), /DB error/);
    });
});

describe('service.updateUser', () => {
    beforeEach(resetMocks);

    test('coerces id to Number and forwards updateData', async () => {
        const updated = { id: 5, username: 'bob', role: 'admin' };
        dbMock.updateUser.mock.mockImplementation(async () => updated);

        const result = await Service.updateUser('5', { role: 'admin' });

        assert.deepEqual(result, updated);
        assert.deepEqual(dbMock.updateUser.mock.calls[0].arguments, [5, { role: 'admin' }]);
    });
});

describe('service.createUser', () => {
    beforeEach(resetMocks);

    test('returns insertId from db.createUser', async () => {
        dbMock.createUser.mock.mockImplementation(async () => 10);

        const result = await Service.createUser('newuser', 'pw', 'user');

        assert.equal(result, 10);
        assert.deepEqual(dbMock.createUser.mock.calls[0].arguments, ['newuser', 'pw', 'user']);
    });

    test('propagates duplicate username error', async () => {
        dbMock.createUser.mock.mockImplementation(async () => {
            throw new Error('Username already exists');
        });

        await assert.rejects(
            () => Service.createUser('dup', 'pw', 'user'),
            /Username already exists/
        );
    });
});

describe('service.deleteUser', () => {
    beforeEach(resetMocks);

    test('coerces id to Number', async () => {
        dbMock.deleteUser.mock.mockImplementation(async () => ({ affectedRows: 1 }));

        await Service.deleteUser('7');

        assert.equal(dbMock.deleteUser.mock.calls[0].arguments[0], 7);
    });
});

describe('service.getOneUser', () => {
    beforeEach(resetMocks);

    test('coerces id to Number and returns row', async () => {
        const user = { id: 3, username: 'carol', role: 'user' };
        dbMock.getOneUser.mock.mockImplementation(async () => user);

        const result = await Service.getOneUser('3');

        assert.deepEqual(result, user);
        assert.equal(dbMock.getOneUser.mock.calls[0].arguments[0], 3);
    });
});

describe('service.countAdminUsers', () => {
    beforeEach(resetMocks);

    test('returns count from db', async () => {
        dbMock.countAdminUsers.mock.mockImplementation(async () => 2);

        const result = await Service.countAdminUsers();

        assert.equal(result, 2);
    });
});

describe('service.createScenario', () => {
    beforeEach(resetMocks);

    test('merges userId into scenarioData before passing to db', async () => {
        dbMock.createScenario.mock.mockImplementation(async () => 99);

        const scenarioData = { name: 'Test', map_width: 10 };
        const result = await Service.createScenario(scenarioData, 1);

        assert.equal(result, 99);
        assert.deepEqual(dbMock.createScenario.mock.calls[0].arguments[0], {
            name: 'Test',
            map_width: 10,
            user_id: 1,
        });
    });

    test('propagates db errors', async () => {
        dbMock.createScenario.mock.mockImplementation(async () => {
            throw new Error('Insert failed');
        });

        await assert.rejects(
            () => Service.createScenario({ name: 'x' }, 1),
            /Insert failed/
        );
    });
});

describe('service.getScenariosByUser', () => {
    beforeEach(resetMocks);

    test('returns rows and total from db', async () => {
        const dbResult = { rows: [{ id: 1, name: 'Scenario 1' }], total: 1 };
        dbMock.getScenariosByUser.mock.mockImplementation(async () => dbResult);

        const result = await Service.getScenariosByUser(1, { sortBy: 'name' });

        assert.deepEqual(result, dbResult);
        assert.deepEqual(dbMock.getScenariosByUser.mock.calls[0].arguments, [1, { sortBy: 'name' }]);
    });

    test('uses default empty options when none provided', async () => {
        dbMock.getScenariosByUser.mock.mockImplementation(async () => ({ rows: [], total: 0 }));

        await Service.getScenariosByUser(1);

        assert.deepEqual(dbMock.getScenariosByUser.mock.calls[0].arguments, [1, {}]);
    });
});

describe('service.getOneScenarioByUser', () => {
    beforeEach(resetMocks);

    test('returns scenario when found', async () => {
        const scenario = { id: 5, name: 'Test', user_id: 1 };
        dbMock.getOneScenarioByUser.mock.mockImplementation(async () => scenario);

        const result = await Service.getOneScenarioByUser(5, 1);

        assert.deepEqual(result, scenario);
        assert.deepEqual(dbMock.getOneScenarioByUser.mock.calls[0].arguments, [5, 1]);
    });

    test('returns undefined when not found', async () => {
        dbMock.getOneScenarioByUser.mock.mockImplementation(async () => undefined);

        const result = await Service.getOneScenarioByUser(999, 1);

        assert.equal(result, undefined);
    });
});

describe('service.updateScenario', () => {
    beforeEach(resetMocks);

    test('coerces id to Number and forwards updateData', async () => {
        const updated = { id: 5, name: 'Updated' };
        dbMock.updateScenario.mock.mockImplementation(async () => updated);

        const result = await Service.updateScenario('5', { name: 'Updated' });

        assert.deepEqual(result, updated);
        assert.deepEqual(dbMock.updateScenario.mock.calls[0].arguments, [5, { name: 'Updated' }]);
    });
});

describe('service.deleteScenario', () => {
    beforeEach(resetMocks);

    test('coerces id to Number', async () => {
        dbMock.deleteScenario.mock.mockImplementation(async () => ({ affectedRows: 1 }));

        await Service.deleteScenario('8');

        assert.equal(dbMock.deleteScenario.mock.calls[0].arguments[0], 8);
    });
});