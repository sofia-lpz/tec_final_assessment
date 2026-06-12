# Final Assessment: Backend API Documentation

This repository contains the backend code for the final undergraduate assessment.

## Authors
* Hector Julian Zarate Ramirez A01027743
* Luis Daniel Filorio Luna A1028418
* Omar Emiliano Sanchez Villegas A01749975
* Sofia Moreno Lopez A01028251

---

## Setup & Installation

### Prerequisites
* Node.js 16+
* MySQL database

### Installation Steps
1. Clone this repository to your local environment.
2. Install dependencies:
```bash
npm install
```
3. Create the environment configuration file from the template:
```bash
cp env.template .env
```
4. Configure your database credentials and `JWT_SECRET` in the `.env` file.
5. Start the server:
```bash
npm run dev    # Development environment
npm start      # Production environment
```

---

## Project Structure

The backend is organized into standard architectural layers to separate routing, business logic, and database access:

* **/api/middleware/auth.js**: Validates JSON Web Tokens using the Bearer schema.
* **/api/middleware/rateLimiter.js**: Implements strict request limits per endpoint to prevent abuse.
* **/api/middleware/role.js**: Ensures administrative access control for user management routes.
* **/api/controller.js**: Handles incoming HTTP requests, processes payload validation, and structures responses.
* **/api/db.js**: Manages the MySQL database connection and executes raw queries.
* **/api/routes.js**: Maps HTTP verbs and endpoints to their respective controller functions.
* **/api/service.js**: Acts as the intermediary logic layer between controllers and the database.

---

## Architecture & Security

### Authentication Flow
1. User sends credentials to `/api/login`.
2. Server validates credentials and returns a JWT token.
3. Client stores the token securely.
4. Client includes the token in the `Authorization: Bearer <token>` header for subsequent requests.
5. Server validates the token and extracts user information.
6. Request is processed based on the user's role and permissions.

### Role-Based Access Control
* **Admin**: Can manage all users and perform all administrative operations.
* **User**: Can create, read, update, and delete their own scenarios.

### Rate Limiting Policies
To protect the infrastructure, the API enforces the following request limits based on the client's IP address:
* **Global Limit**: 100 requests per 1 minute.
* **Login (`/api/login`)**: 10 attempts per 15 minutes.
* **Register (`/api/register`)**: 5 requests per 1 hour.
* **Logout (`/api/logout`)**: 30 requests per 1 minute.

### Security Notes
* Passwords are hashed using bcrypt before storage.
* JWT tokens expire after 1 hour.
* The last admin user cannot be deleted or demoted.
* Users can only access their own scenarios.
* All API responses are in JSON format.

---

## API Endpoints

### 1. Authentication
All endpoints except `/api/login` and `/api/register` require a JWT token in the Authorization header.

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
* `401 Unauthorized`: Invalid credentials (user not found or wrong password).
* `500 Internal Server Error`: Server error.

#### POST `/api/register`
Register a new user in the system. The default role assigned is 'user'.

**Request:**
```json
{
  "username": "newuser@example.com",
  "password": "securepassword123"
}
```

**Response (200 OK):**
```json
{
  "id": 1,
  "username": "newuser@example.com",
  "role": "user"
}
```

#### POST `/api/logout`
Invalidate the current session by incrementing the token version in the database.

**Response (200 OK):**
```json
{
  "status": "OK",
  "message": "Logged out"
}
```

---

### 2. Users (Admin Only)
All user endpoints require the `admin` role and a valid JWT token.

#### GET `/api/usuarios`
Retrieve all users.

**Query Parameters:**
* `_start` (optional): Pagination start index.
* `_end` (optional): Pagination end index.
* `_sort` (optional): Sort field.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "username": "admin@example.com",
    "role": "admin"
  }
]
```

#### GET `/api/usuarios/:id`
Retrieve a specific user by ID.

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

#### PUT `/api/usuarios/:id`
Update an existing user. Contains safeguards to prevent demoting the last remaining administrator.

#### DELETE `/api/usuarios/:id`
Delete a user. Contains safeguards to prevent deleting the last remaining administrator.

---

### 3. Scenarios (Authenticated Users)
Users can only access their own scenarios.

#### GET `/api/scenarios`
Retrieve all scenarios for the authenticated user. Supports pagination and sorting.

#### POST `/api/scenarios`
Create a new scenario. Requires strict validation of all parameters. The `critic` field only accepts `"IPPO"` or `"MAPPO"`.

**Request:**
```json
{
  "scenario": {
    "name": "Simulación Alfa",
    "broadcast_reward": 10.5,
    "destroyed_reward": -50.0,
    "conquer_reward": 100.0,
    "colonize_reward": 50.0,
    "survive_reward": 1.0,
    "population_reward": 2.5,
    "science_reward": 5.0,
    "explore_reward": 3.0,
    "invalid_reward": -1.0,
    "civilizations": 4,
    "map_width": 100,
    "map_height": 100,
    "planets": 10,
    "harvest_rate": 1.5,
    "initial_resources": 500,
    "initial_population": 100,
    "max_steps": 2000,
    "critic": "MAPPO",
    "learning_rate": 0.0003,
    "gamma": 0.99
  }
}
```

**Response (200 OK):**
```json
{
  "id": 3,
  "name": "Simulación Alfa",
  "userId": 2
}
```

**Errors:**
* `400 Bad Request`: Missing required fields or invalid critic.

#### GET `/api/scenarios/:id`
Retrieve a specific scenario by ID.

#### PUT `/api/scenarios/:id`
Update a scenario. Supports partial updates. If the `critic` field is sent, it will be validated.

#### DELETE `/api/scenarios/:id`
Delete a scenario.

---

## Error Handling
All standard errors return a JSON payload with a descriptive message to facilitate frontend integration:

```json
{
  "error": "Error description"
}
```