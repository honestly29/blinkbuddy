# blinkbuddy_service.py
# This file is the entry point PyInstaller uses to build the frozen
# binary. 
# It lives at the project root so that PyInstaller treats it as a standalone script 
from python.main import main

if __name__ == "__main__":
    main()