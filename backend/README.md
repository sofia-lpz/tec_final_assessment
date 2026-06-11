# Backend API Documentation

## Setup

### Prerequisites
- Node.js 16+
- MySQL database

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from template:
```bash
cp env.template .env
```

3. Configure your database and JWT secret in `.env`

4. Start the server:
```bash
npm run dev    # Development with nodemon
npm start      # Production
```


## Authentication Flow

1. User sends credentials to `/api/login`
2. Server validates credentials and returns JWT token
3. Client stores the token
4. Client includes token in `Authorization: Bearer <token>` header for subsequent requests
5. Server validates token and extracts user information
6. Request is processed based on user's role and permissions

## Role-Based Access Control

- **Admin**: Can manage all users and perform all admin operations
- **User**: Can create and manage their own scenarios

## Security Notes

- Passwords are hashed using bcrypt before storage
- JWT tokens expire after 1 hour
- The last admin user cannot be deleted or demoted
- Users can only access their own scenarios
- All API responses are in JSON format

## Authentication

All endpoints except `/api/login` require a JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

The token expires after 1 hour.

## API Endpoints

### Authentication

#### POST `/api/login`
Authenticate a user and receive a JWT token.

**Request:**
```json
{
  "username": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "status": "OK",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "role": "user"
}
```

**Errors:**
- `401 Unauthorized`: Invalid credentials (user not found or wrong password)
- `500 Internal Server Error`: Server error

---

### Users (Admin Only)

All user endpoints require admin role and valid JWT token.

#### GET `/api/usuarios`
Retrieve all users with optional pagination and sorting.

**Query Parameters:**
- `_start` (optional): Pagination start index
- `_end` (optional): Pagination end index
- `_sort` (optional): Enable pagination mode

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "username": "admin@example.com",
    "role": "admin"
  },
  {
    "id": 2,
    "username": "user@example.com",
    "role": "user"
  }
]
```

**Headers:**
- `X-Total-Count`: Total number of users
- `Content-Range`: Range of returned items

**Errors:**
- `403 Forbidden`: Not an admin user
- `500 Internal Server Error`: Server error

#### GET `/api/usuarios/:id`
Retrieve a specific user by ID.

**Parameters:**
- `id` (required): User ID

**Response (200 OK):**
```json
{
  "id": 1,
  "username": "admin@example.com",
  "role": "admin"
}
```

**Errors:**
- `400 Bad Request`: ID is required
- `403 Forbidden`: Not an admin user
- `500 Internal Server Error`: Server error

#### POST `/api/usuarios`
Create a new user.

**Request:**
```json
{
  "username": "newuser@example.com",
  "password": "securepassword123",
  "role": "user"
}
```

**Response (200 OK):**
```json
{
  "id": 3,
  "username": "newuser@example.com",
  "role": "user"
}
```

**Errors:**
- `403 Forbidden`: Not an admin user
- `500 Internal Server Error`: Server error

#### PUT `/api/usuarios/:id`
Update an existing user.

**Parameters:**
- `id` (required): User ID

**Request:**
```json
{
  "username": "updateduser@example.com",
  "password": "newpassword123",
  "role": "admin"
}
```

**Response (200 OK):**
```json
{
  "id": 1,
  "username": "updateduser@example.com",
  "role": "admin"
}
```

**Special Rules:**
- Cannot demote the last admin user in the system

**Errors:**
- `400 Bad Request`: Cannot demote the last admin user
- `403 Forbidden`: Not an admin user
- `500 Internal Server Error`: Server error

#### DELETE `/api/usuarios/:id`
Delete a user.

**Parameters:**
- `id` (required): User ID

**Response (200 OK):**
```json
{
  "message": "User deleted successfully"
}
```

**Special Rules:**
- Cannot delete the last admin user in the system

**Errors:**
- `400 Bad Request`: ID is required or cannot delete the last admin user
- `403 Forbidden`: Not an admin user
- `500 Internal Server Error`: Server error

---

### Scenarios (Authenticated Users)

All scenario endpoints require a valid JWT token. Users can only access their own scenarios.

#### GET `/api/scenarios`
Retrieve all scenarios for the authenticated user.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "name": "Scenario 1",
    "userId": 2,
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  },
  {
    "id": 2,
    "name": "Scenario 2",
    "userId": 2,
    "createdAt": "2024-01-16T14:20:00Z",
    "updatedAt": "2024-01-16T14:20:00Z"
  }
]
```

**Errors:**
- `401 Unauthorized`: Missing or invalid token
- `500 Internal Server Error`: Server error

#### POST `/api/scenarios`
Create a new scenario.

**Request:**
```json
{
  "name": "My Scenario",
}
```

**Response (200 OK):**
```json
{
  "id": 3,
  "name": "My Scenario",
  "userId": 2
}
```

**Errors:**
- `401 Unauthorized`: Missing or invalid token
- `500 Internal Server Error`: Server error

#### GET `/api/scenarios/:id`
Retrieve a specific scenario by ID.

**Parameters:**
- `id` (required): Scenario ID

**Response (200 OK):**
```json
{
  "id": 1,
  "name": "Scenario 1",
  "userId": 2,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

**Errors:**
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Access denied (scenario belongs to another user)
- `404 Not Found`: Scenario not found
- `500 Internal Server Error`: Server error

#### PUT `/api/scenarios/:id`
Update a scenario.

**Parameters:**
- `id` (required): Scenario ID

**Request:**
```json
{
  "name": "Updated Scenario Name",
}
```

**Response (200 OK):**
```json
{
  "id": 1,
  "name": "Updated Scenario Name",
  "userId": 2,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T11:45:00Z"
}
```

**Errors:**
- `400 Bad Request`: ID is required
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Access denied (scenario belongs to another user)
- `500 Internal Server Error`: Server error

#### DELETE `/api/scenarios/:id`
Delete a scenario.

**Parameters:**
- `id` (required): Scenario ID

**Response (200 OK):**
```json
{
  "message": "Scenario deleted successfully"
}
```

**Errors:**
- `400 Bad Request`: ID is required
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Access denied (scenario belongs to another user)
- `500 Internal Server Error`: Server error

---

## Error Handling

All errors return JSON with an error message:

```json
{
  "error": "Error description"
}
```