# Cloud API - Run Instructions

## Prerequisites

- Python 3.9+
- Virtual environment (`.venv`) should be located in the project root directory (`ocpp-server/.venv`)
- All dependencies should be installed in the virtual environment

## Directory Structure

```
ocpp-server/
├── .venv/                 # Virtual environment (project root level)
├── cloud-api/            # FastAPI application
│   ├── main.py
│   ├── requirements.txt
│   ├── routes/
│   └── ...
├── station-controller/
├── management-ui/
└── resident-ui/
```

## Running the Application

### 1. Navigate to Project Root
```bash
cd /path/to/ocpp-server
```

### 2. Activate Virtual Environment
```bash
source .venv/bin/activate
```

### 3. Navigate to Cloud API Directory
```bash
cd cloud-api
```

### 4. Run the Application
```bash
python main.py
```

## Complete Command Sequence

From any directory, use this sequence:
```bash
cd /path/to/ocpp-server && source .venv/bin/activate && cd cloud-api && python main.py
```

## Troubleshooting

### Virtual Environment Issues
- Ensure `.venv` exists in the project root (`ocpp-server/.venv`)
- If virtual environment doesn't exist, create it:
  ```bash
  cd ocpp-server
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r cloud-api/requirements.txt
  ```

### Database Issues
- On local development, you may see database path errors (e.g., `/home/ubuntu/ocpp-data/cloud.db`)
- This is expected as the application is configured for Ubuntu server deployment
- The application should still start successfully if dependencies are resolved

### Common FastAPI Dependency Errors
- If you see "Invalid args for response field" errors with SQLAlchemy Session
- Ensure all route functions use `Depends(get_db_dependency)` instead of `get_db_dependency()`
- Check that imports include `Depends` from FastAPI

## Dependencies Fixed

The following dependency pattern should be used in all route files:
```python
from fastapi import Depends
from dependencies import get_db_dependency

@router.get("/")
def some_endpoint(db: Session = Depends(get_db_dependency)):
    # Route logic here
```

**NOT:**
```python
def some_endpoint(db: Session = get_db_dependency()):  # ❌ Wrong
```

## Environment Variables

The application uses the following key configurations:
- Database path: Configured in `constants.py` 
- Virtual environment: `.venv` in project root
- Python version: 3.9+ (check with `python --version`)

## Testing the Fix

After starting the application, you should see:
1. Flyway migration attempts (may fail locally due to path issues - this is normal)
2. No FastAPI dependency injection errors
3. Application startup logs

If you see "Invalid args for response field" errors, the dependency injection needs to be fixed as described above.
