# Dark Forest Multi-Agent Reinforcement Learning Simulation

A comprehensive platform for training and visualizing multi-agent reinforcement learning agents in a complex Dark Forest simulation environment. This project combines cutting-edge RL training using TorchRL with an interactive web interface for scenario management and real-time 3D visualization.

## Overview

This final assessment project implements a complete system for:
- **Multi-Agent RL Training**: Using IPPO/MAPPO algorithms to train civilizations in a competitive Dark Forest scenario
- **Web-Based Scenario Manager**: Backend API and frontend dashboard for creating, saving, and managing simulation scenarios
- **3D Interactive Visualization**: Real-time 3D solar system visualization with React Three Fiber

## Project Structure

```
tec_final_assessment/
├── backend/              # Node.js Express API server
├── frontend/my-app/      # Next.js React web interface
├── ml/darkForest/        # TorchRL training scripts and environment
├── database/             # MySQL schema and initialization
└── certificates/         # SSL/TLS certificates (if needed)
```

## Authors

- Hector Julian Zarate Ramirez (A01027743)
- Luis Daniel Filorio Luna (A1028418)
- Omar Emiliano Sanchez Villegas (A01749975)
- Sofia Moreno Lopez (A01028251)

## Prerequisites

- **Node.js 16+** and npm
- **Python 3.10+** and pip
- **MySQL 8.0+** or MariaDB
- **CUDA 13.0+** (optional, for GPU acceleration in ML training)
- **Git**

## Installation

### 1. Database Setup

First, initialize the MySQL database:

```bash
# Start MySQL service (if not running)
sudo systemctl start mysql  # Linux
# or
brew services start mysql   # macOS

# Create the database and tables
mysql -u root -p < database/schema.sql
```

Create a MySQL user for the application (or use root):
```sql
CREATE USER 'assessment'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON assessment.* TO 'assessment'@'localhost';
FLUSH PRIVILEGES;
```

### 2. Backend API Setup

Navigate to the backend directory and install dependencies:

```bash
cd backend

# Install dependencies
npm install

# Create .env file from template
cp env.template .env
```

Edit `.env` with your configuration:
```env
DB_HOST=localhost
DB_USER=assessment
DB_PASSWORD=your_password
DB_DATABASE=assessment
JWT_SECRET=your_secret_key_here
PORT=8080
NODE_ENV=development
```

Start the backend server:
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:8080`

### 3. Frontend Setup

Navigate to the frontend directory:

```bash
cd frontend/my-app

# Install dependencies
npm install

# Create .env file from template (if needed)
cp env.template .env.local
```

Configure `.env.local` with the backend API URL:
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### 4. ML Training Setup

Navigate to the ML directory:

```bash
cd ml/darkForest

# Create a Python virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt
```

Verify the installation:
```bash
python -c "import torchrl; print('TorchRL installed successfully')"
```

## Running the System

### Starting All Components

1. **Terminal 1 - Database**: Ensure MySQL is running
   ```bash
   sudo systemctl status mysql
   ```

2. **Terminal 2 - Backend API**:
   ```bash
   cd backend
   npm run dev
   ```

3. **Terminal 3 - Frontend**:
   ```bash
   cd frontend/my-app
   npm run dev
   ```

4. **Terminal 4 - ML Training** (optional, for training new models):
   ```bash
   cd ml/darkForest
   source venv/bin/activate  # Activate venv
   python train.py --config your_config.json
   ```

### Training New Models

To train new agent models using the configuration from the web interface:

```bash
cd ml/darkForest
source venv/bin/activate

python train.py \
  --num_envs 4 \
  --num_train_frames 1000000 \
  --width 32 \
  --height 32 \
  --initial_planets 20 \
  --max_steps 1000 \
  --harvest_rate 1.0 \
  --initial_resources 100 \
  --initial_population 100 \
  --critic IPPO
```

## API Documentation

The backend API provides the following key endpoints:

### Authentication
- `POST /api/login` - User login
- `POST /api/register` - User registration

### Scenarios
- `GET /api/scenarios` - List user's scenarios
- `POST /api/scenarios` - Create new scenario
- `GET /api/scenarios/:id` - Get scenario details
- `PUT /api/scenarios/:id` - Update scenario
- `DELETE /api/scenarios/:id` - Delete scenario

### Training
- `POST /api/train` - Start new training run
- `GET /api/train/:id` - Get training status
- `GET /api/train/:id/results` - Get training results

See [backend/README.md](backend/README.md) for full API documentation.

## Frontend Features

- **Dashboard**: View and manage simulation scenarios
- **3D Visualization**: Real-time 3D rendering of solar systems and civilizations
- **Scenario Editor**: Create and configure simulation parameters
- **Training Monitor**: Track training progress and view results
- **Export/Import**: Save and load scenario configurations

## Environment Variables

### Backend (`backend/.env`)
```env
DB_HOST=localhost
DB_USER=assessment
DB_PASSWORD=your_password
DB_DATABASE=assessment
JWT_SECRET=your_secret_key
PORT=8080
NODE_ENV=development
```

### Frontend (`frontend/my-app/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### ML Training (`ml/darkForest/.env`)
```env
CUDA_VISIBLE_DEVICES=0
TL_DEVICE=cuda
```

## Development

### Backend Development
- Uses Express.js with modern ES6 modules
- Includes middleware for authentication, rate limiting, and logging
- See [backend/README.md](backend/README.md) for detailed backend documentation

### Frontend Development
- Built with Next.js 16 and React 19
- Uses TypeScript for type safety
- 3D graphics powered by Three.js and React Three Fiber
- Styling with Tailwind CSS

### ML Development
- Uses TorchRL for multi-agent RL
- Supports both IPPO and MAPPO algorithms
- Training runs are saved in `ml/darkForest/runs/`

## Troubleshooting

### Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:3306
```
- Ensure MySQL is running: `sudo systemctl start mysql`
- Check credentials in `.env` file
- Verify database exists: `mysql -u root -p -e "SHOW DATABASES;"`

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::8080
```
- Change PORT in `.env` file
- Or kill the process: `lsof -i :8080 | grep LISTEN | awk '{print $2}' | xargs kill -9`

### Python Dependencies Issue
- Ensure you're in the virtual environment: `source venv/bin/activate`
- Reinstall dependencies: `pip install -r requirements.txt --force-reinstall`
- For CUDA issues, verify CUDA installation: `nvidia-smi`

### Frontend Build Errors
```bash
cd frontend/my-app
npm run build
```

## Performance Optimization

- Use `npm run build` for production frontend builds
- Enable GPU training with `CUDA_VISIBLE_DEVICES=0,1` for multiple GPUs
- Increase `num_envs` in training for better parallelization
- Use Redis for session caching (optional future enhancement)

## License

ISC

## Support

For issues or questions, please refer to the individual component README files:
- [Backend Documentation](backend/README.md)
- [Database Schema](database/schema.sql)

